// Reportes (`/api/reports`, clave de permisos `reports`; Fase 5.3 del Roadmap
// de cotizaciones, Obsidian "Fase 5 - Dinero"). Módulo propio para venderlo
// aparte y dárselo a store_admin sin darle el Panel de infraestructura.
//
// GET /summary?from=AAAA-MM-DD&to=AAAA-MM-DD&groupBy=day|week|month — todo
// en la zona horaria de la agenda (AppointmentSettings.timezone):
// - Ventas: pedidos pagados (de "Pagado" en adelante) por fecha de alta;
//   ventas = total cobrado + lo pagado con tarjeta de regalo; ticket
//   promedio, serie por periodo, pedidos por estado (todos), productos más
//   vendidos, clientes nuevos vs recurrentes (por correo), cupones.
// - Citas: por fecha de la cita; por estado, especialista y servicio; % de
//   cancelación y de no-show; ingresos de las completadas; anticipos cobrados.
// - Tarjetas de regalo y lealtad: vendidas/canjeadas y puntos ganados/usados.
// GET /export?type=orders|appointments&from&to — CSV para Excel.
//
// Las consultas de ventas y fechas viven en lib/reportQueries.js (las usa
// también el Inicio, modules/dashboard.js). Se agrega en JS sobre consultas acotadas (un año como máximo): una tienda
// tiene miles de pedidos, no millones, y así no depende de la versión de Mongo
// ($dateTrunc es 5.0+).
const express = require("express");
const { createModuleAuthorizer, isModuleContracted } = require("../lib/permissions");
const { DAY, round2, localMidnight, localDate, periodKey, allPeriods, salesSummary, timezoneOf, toCsv } = require("../lib/reportQueries");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const router = express.Router();
  router.use(verifyToken);
  router.use(createModuleAuthorizer({ mongooseConnection, sendError }).authorizeModule("reports"));

  // from/to/groupBy validados → { from, to, start, end, groupBy, tz } o { error }.
  const parseRange = async (query) => {
    const tz = await timezoneOf(mongooseConnection);
    const today = localDate(new Date(), tz);
    const to = DATE_PATTERN.test(query.to || "") ? query.to : today;
    const from = DATE_PATTERN.test(query.from || "") ? query.from : localDate(+localMidnight(to, tz) - 29 * DAY, tz);
    if (from > to) return { error: "from debe ser antes que to." };
    const start = localMidnight(from, tz);
    const end = new Date(+localMidnight(to, tz) + DAY);
    if ((end - start) / DAY > MAX_DAYS + 1) return { error: `El rango puede ser de hasta ${MAX_DAYS} días.` };
    const groupBy = ["day", "week", "month"].includes(query.groupBy) ? query.groupBy : (end - start) / DAY > 62 ? "month" : "day";
    return { from, to, start, end, groupBy, tz };
  };

  const salesReport = (range) => salesSummary(mongooseConnection, range);

  const appointmentsReport = async ({ start, end, groupBy, tz, from, to }) => {
    const Appointment = mongooseConnection.models.Appointment;
    if (!Appointment) return null;
    const list = await Appointment.find({ start: { $gte: start, $lt: end } })
      .select("status start total services specialist specialistName depositAmount depositPaidAt")
      .lean();
    const count = (status) => list.filter((a) => a.status === status).length;
    const completed = list.filter((a) => a.status === "completed");
    // % sobre las citas que ya "pasaron por la agenda" (no las pendientes de confirmar o de anticipo).
    const settled = list.filter((a) => ["completed", "no_show", "cancelled", "confirmed"].includes(a.status)).length;

    const series = new Map(allPeriods(from, to, groupBy).map((k) => [k, { period: k, appointments: 0, completed: 0 }]));
    for (const a of list) {
      if (a.status === "cancelled") continue;
      const row = series.get(periodKey(a.start, tz, groupBy));
      if (row) {
        row.appointments += 1;
        if (a.status === "completed") row.completed += 1;
      }
    }
    const bySpecialist = new Map();
    for (const a of list) {
      const key = String(a.specialist);
      const row = bySpecialist.get(key) || { specialist: a.specialist, name: a.specialistName || "—", total: 0, completed: 0, cancelled: 0, noShow: 0, revenue: 0 };
      row.total += 1;
      if (a.status === "completed") {
        row.completed += 1;
        row.revenue = round2(row.revenue + (a.total || 0));
      }
      if (a.status === "cancelled") row.cancelled += 1;
      if (a.status === "no_show") row.noShow += 1;
      bySpecialist.set(key, row);
    }
    const byService = new Map();
    for (const a of list) {
      if (a.status === "cancelled") continue;
      for (const sv of a.services || []) {
        const key = String(sv.service);
        const row = byService.get(key) || { service: sv.service, name: sv.name, count: 0, revenue: 0 };
        row.count += 1;
        if (a.status === "completed") row.revenue = round2(row.revenue + (sv.price || 0));
        byService.set(key, row);
      }
    }
    const statuses = {};
    for (const a of list) statuses[a.status] = (statuses[a.status] || 0) + 1;
    return {
      total: list.length,
      completed: completed.length,
      revenue: round2(completed.reduce((s, a) => s + (a.total || 0), 0)),
      cancellationRate: pct(count("cancelled"), list.length),
      noShowRate: pct(count("no_show"), settled),
      depositsCollected: round2(list.filter((a) => a.depositPaidAt).reduce((s, a) => s + (a.depositAmount || 0), 0)),
      series: [...series.values()],
      byStatus: Object.entries(statuses).map(([status, n]) => ({ status, count: n })).sort((a, b) => b.count - a.count),
      bySpecialist: [...bySpecialist.values()].sort((a, b) => b.total - a.total),
      byService: [...byService.values()].sort((a, b) => b.count - a.count).slice(0, 15),
    };
  };

  const giftCardsReport = async ({ start, end }) => {
    const GiftCard = mongooseConnection.models.GiftCard;
    if (!GiftCard) return null;
    const sold = await GiftCard.find({ activatedAt: { $gte: start, $lt: end } }).select("amount").lean();
    const [moves] = await GiftCard.aggregate([
      { $unwind: "$movements" },
      { $match: { "movements.at": { $gte: start, $lt: end }, "movements.type": { $in: ["redeem", "refund"] } } },
      { $group: { _id: null, redeemed: { $sum: { $cond: [{ $eq: ["$movements.type", "redeem"] }, { $multiply: ["$movements.delta", -1] }, 0] } }, refunded: { $sum: { $cond: [{ $eq: ["$movements.type", "refund"] }, "$movements.delta", 0] } } } },
    ]);
    const [outstanding] = await GiftCard.aggregate([{ $match: { status: "active" } }, { $group: { _id: null, balance: { $sum: "$balance" }, cards: { $sum: 1 } } }]);
    return {
      soldCount: sold.length,
      soldAmount: round2(sold.reduce((s, c) => s + c.amount, 0)),
      redeemed: round2((moves?.redeemed || 0) - (moves?.refunded || 0)),
      outstandingBalance: round2(outstanding?.balance || 0),
      activeCards: outstanding?.cards || 0,
    };
  };

  const loyaltyReport = async ({ start, end }) => {
    const Ledger = mongooseConnection.models.LoyaltyLedger;
    if (!Ledger) return null;
    const rows = await Ledger.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: { program: "$program", reason: "$reason" }, total: { $sum: "$delta" }, count: { $sum: 1 } } },
    ]);
    const sum = (program, reasons) => round2(rows.filter((r) => r._id.program === program && reasons.includes(r._id.reason)).reduce((s, r) => s + r.total, 0));
    return {
      pointsEarned: sum("points", ["earn", "reverse"]),
      pointsRedeemed: -sum("points", ["redeem", "refund"]),
      stampsEarned: sum("stamps", ["earn", "reverse"]),
      rewardsRedeemed: rows.filter((r) => r._id.program === "stamps" && r._id.reason === "reward_redeemed").reduce((s, r) => s + r.count, 0),
    };
  };

  router.get("/summary", async (req, res) => {
    try {
      const range = await parseRange(req.query);
      if (range.error) return sendError(res, 400, "VALIDATION_ERROR", range.error);
      const contracted = async (key) => isModuleContracted(mongooseConnection, key);
      const [orders, appointments, giftCards, loyalty] = await Promise.all([contracted("orders"), contracted("appointments"), contracted("giftCards"), contracted("loyalty")]);
      const [sales, appts, gifts, points] = await Promise.all([
        orders ? salesReport(range) : null,
        appointments ? appointmentsReport(range) : null,
        giftCards ? giftCardsReport(range) : null,
        loyalty ? loyaltyReport(range) : null,
      ]);
      return res.status(200).json({
        range: { from: range.from, to: range.to, groupBy: range.groupBy, timezone: range.tz },
        sales,
        appointments: appts,
        giftCards: gifts,
        loyalty: points,
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al armar el reporte.");
    }
  });

  router.get("/export", async (req, res) => {
    try {
      const range = await parseRange(req.query);
      if (range.error) return sendError(res, 400, "VALIDATION_ERROR", range.error);
      const fmt = (d) => (d ? new Date(d).toLocaleString("es-MX", { timeZone: range.tz }) : "");
      let rows;
      if (req.query.type === "appointments") {
        const Appointment = mongooseConnection.models.Appointment;
        const list = Appointment ? await Appointment.find({ start: { $gte: range.start, $lt: range.end } }).sort({ start: 1 }).lean() : [];
        rows = [
          ["Folio", "Fecha", "Estado", "Especialista", "Servicios", "Total", "Anticipo", "Anticipo pagado", "Clienta", "Correo", "Teléfono", "Origen"],
          ...list.map((a) => [a.appointmentNumber, fmt(a.start), a.status, a.specialistName, (a.services || []).map((s) => s.name).join(" + "), a.total, a.depositAmount || 0, a.depositPaidAt ? "sí" : "no", a.customerName, a.customerEmail, a.customerPhone, a.source]),
        ];
      } else if (req.query.type === "orders" || !req.query.type) {
        const Order = mongooseConnection.models.Order;
        const list = Order ? await Order.find({ createdAt: { $gte: range.start, $lt: range.end } }).sort({ createdAt: 1 }).lean() : [];
        rows = [
          ["Folio", "Fecha", "Estado", "Cliente", "Correo", "Productos", "Cupón", "Descuento", "Puntos", "Envío", "Tarjeta de regalo", "Total cobrado", "Entrega", "Pago"],
          ...list.map((o) => [
            o.orderNumber,
            fmt(o.createdAt),
            o.status,
            o.customerName,
            o.customerEmail,
            (o.items || []).map((i) => `${i.productName}${i.variantLabel ? ` (${i.variantLabel})` : ""} x${i.quantity}`).join("; "),
            o.discount?.code || "",
            o.discount?.amount || 0,
            o.loyalty?.redeemed || 0,
            o.shippingCost || 0,
            o.giftCard?.refunded ? 0 : o.giftCard?.amount || 0,
            o.total,
            o.deliveryMethod,
            o.paymentMethodLabel || o.paymentMethod,
          ]),
        ];
      } else {
        return sendError(res, 400, "VALIDATION_ERROR", "type debe ser orders o appointments.");
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${req.query.type || "orders"}-${range.from}-a-${range.to}.csv"`);
      return res.status(200).send(toCsv(rows));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al exportar.");
    }
  });

  app.use("/api/reports", router);
}

module.exports = { name: "reports", registerRoutes, models: {} };
