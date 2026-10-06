// Consultas de ventas y fechas que comparten Reportes (modules/reports.js) y
// el Inicio del admin (modules/dashboard.js), para que las dos pantallas den
// exactamente las mismas cifras. Fechas en la zona horaria de la agenda.
const PAID_STATUSES = ["confirmed", "processing", "shipped", "delivered", "ready_for_pickup", "picked_up"];
const DAY = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// Medianoche local (zona `tz`) de una fecha AAAA-MM-DD, en UTC.
const localMidnight = (dateStr, tz) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess))
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess - (asLocal - guess));
};

const localDate = (date, tz) => new Date(date).toLocaleDateString("en-CA", { timeZone: tz });

// Clave del periodo de una fecha: día (AAAA-MM-DD), semana (lunes) o mes (AAAA-MM).
const periodKey = (date, tz, groupBy) => {
  const day = localDate(date, tz);
  if (groupBy === "month") return day.slice(0, 7);
  if (groupBy === "week") {
    const d = new Date(`${day}T12:00:00Z`);
    const offset = (d.getUTCDay() + 6) % 7;
    return new Date(+d - offset * DAY).toISOString().slice(0, 10);
  }
  return day;
};

// Todos los periodos del rango, para que la serie no tenga huecos.
const allPeriods = (from, to, groupBy) => {
  const keys = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d = new Date(+d + DAY)) {
    const key = periodKey(d, "UTC", groupBy);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return [...new Set(keys)];
};


// Pedidos pagados (de "Pagado" en adelante) creados en [start, end): ventas =
// total cobrado + lo pagado con tarjeta de regalo; serie por periodo, estados,
// productos, clientes nuevos vs recurrentes y cupones. null sin pedidos.
const salesSummary = async (connection, { start, end, groupBy, tz, from, to }) => {
const Order = connection.models.Order;
  if (!Order) return null;
  const orders = await Order.find({ createdAt: { $gte: start, $lt: end } })
    .select("status total giftCard discount loyalty shippingCost items customerEmail createdAt deliveryMethod")
    .lean();
  const paid = orders.filter((o) => PAID_STATUSES.includes(o.status));
  const valueOf = (o) => round2((o.total || 0) + (o.giftCard?.refunded ? 0 : o.giftCard?.amount || 0));
  const revenue = round2(paid.reduce((s, o) => s + valueOf(o), 0));

  const series = new Map(allPeriods(from, to, groupBy).map((k) => [k, { period: k, orders: 0, revenue: 0 }]));
  for (const o of paid) {
    const row = series.get(periodKey(o.createdAt, tz, groupBy));
    if (row) {
      row.orders += 1;
      row.revenue = round2(row.revenue + valueOf(o));
    }
  }

  const byStatus = {};
  for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;

  const products = new Map();
  for (const o of paid) {
    for (const item of o.items || []) {
      const key = `${item.product}|${item.variant || ""}`;
      const row = products.get(key) || { product: item.product, name: item.productName + (item.variantLabel ? ` · ${item.variantLabel}` : ""), quantity: 0, revenue: 0 };
      row.quantity += item.quantity || 0;
      row.revenue = round2(row.revenue + (item.subtotal || 0));
      products.set(key, row);
    }
  }

  // Clientes por correo: nuevos = su primer pedido pagado cae en el rango.
  const emails = [...new Set(paid.map((o) => o.customerEmail).filter(Boolean))];
  const before = emails.length
    ? await Order.distinct("customerEmail", { customerEmail: { $in: emails }, status: { $in: PAID_STATUSES }, createdAt: { $lt: start } })
    : [];
  const coupons = new Map();
  for (const o of paid) {
    if (!o.discount?.code) continue;
    const row = coupons.get(o.discount.code) || { code: o.discount.code, uses: 0, discount: 0 };
    row.uses += 1;
    row.discount = round2(row.discount + (o.discount.amount || 0));
    coupons.set(o.discount.code, row);
  }

  return {
    orders: paid.length,
    revenue,
    avgTicket: paid.length ? round2(revenue / paid.length) : 0,
    itemsSold: [...products.values()].reduce((s, p) => s + p.quantity, 0),
    discounts: round2(paid.reduce((s, o) => s + (o.discount?.amount || 0), 0)),
    pointsRedeemed: round2(paid.reduce((s, o) => s + (o.loyalty?.redeemed || 0), 0)),
    giftCardPaid: round2(paid.reduce((s, o) => s + (o.giftCard?.refunded ? 0 : o.giftCard?.amount || 0), 0)),
    shipping: round2(paid.reduce((s, o) => s + (o.shippingCost || 0), 0)),
    allOrders: orders.length,
    series: [...series.values()],
    byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    customers: { total: emails.length, returning: before.length, new: emails.length - before.length },
    coupons: [...coupons.values()].sort((a, b) => b.uses - a.uses),
    deliveryMethods: ["shipping", "pickup"].map((m) => ({ method: m, count: paid.filter((o) => o.deliveryMethod === m).length })),
  };
};

// Zona horaria de la agenda (AppointmentSettings.timezone).
const timezoneOf = async (connection) => {
  const Settings = connection.models.AppointmentSettings;
  const doc = Settings ? await Settings.findOne({ singletonKey: "default" }).select("timezone").lean() : null;
  return doc?.timezone || "America/Mexico_City";
};

module.exports = { PAID_STATUSES, DAY, round2, localMidnight, localDate, periodKey, allPeriods, salesSummary, timezoneOf };
