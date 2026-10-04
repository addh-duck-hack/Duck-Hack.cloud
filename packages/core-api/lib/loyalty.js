// Lealtad (Fase 4.1 del Roadmap de cotizaciones, Obsidian "Fase 4 -
// Fidelizacion"): la lógica que comparten pedidos (modules/orders.js), citas
// (modules/appointments.js) y el propio módulo (modules/loyalty.js, que
// registra los modelos LoyaltySettings / LoyaltyAccount / LoyaltyLedger).
//
// Dos programas en el mismo motor, cada uno con su interruptor:
// - puntos (tienda): monedero en pesos (1 punto = $1). Se abonan al pagarse
//   el pedido (`earnPercent` de productos − cupón − puntos usados, sin envío)
//   y se revierten si se cancela o se borra. Se canjean en el checkout.
// - sellos (salón): +1 por cita completada; al llegar a `goal` → un beneficio
//   (texto) que la encargada marca como usado en el panel.
//
// Todo cambio de saldo deja un movimiento en LoyaltyLedger. Las marcas en el
// pedido / la cita (earnedCounted, redeemRefunded, loyaltyStampCounted) se
// cambian con updates condicionados: un pedido nunca abona ni revierte dos
// veces aunque lleguen cambios al mismo tiempo. El saldo nunca queda negativo:
// si se revierte algo que ya se gastó, se descuenta hasta 0 y queda la nota.
const { isModuleContracted } = require("./permissions");
const { notify } = require("./notify");
const { loyaltyRewardEmailTemplate } = require("./emailTemplates");

// Igual que DEDUCTED_STATUSES de modules/orders.js: de "Pagado" en adelante.
const PAID_STATUSES = ["confirmed", "processing", "shipped", "delivered", "ready_for_pickup", "picked_up"];

const DEFAULT_SETTINGS = Object.freeze({
  points: { enabled: false, earnPercent: 5, maxRedeemPercent: 100, minRedeem: 0, expiryMonths: null, expiryWarningDays: 15 },
  stamps: { enabled: false, goal: 10, reward: "Un servicio gratis" },
});

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const getLoyaltySettings = async (connection) => {
  const Settings = connection.models.LoyaltySettings;
  const doc = Settings ? await Settings.findOne({ singletonKey: "default" }).lean() : null;
  return {
    points: { ...DEFAULT_SETTINGS.points, ...(doc?.points || {}) },
    stamps: { ...DEFAULT_SETTINGS.stamps, ...(doc?.stamps || {}) },
  };
};

// ¿Corre este programa en la tienda? (módulo contratado + interruptor).
const isProgramActive = async (connection, program) => {
  if (!connection.models.LoyaltyAccount || !(await isModuleContracted(connection, "loyalty"))) return false;
  return Boolean((await getLoyaltySettings(connection))[program]?.enabled);
};

// Cuenta de cliente de un pedido o cita: la ligada, o la que tenga ese correo
// (mismo criterio que "Mis pedidos").
const resolveLoyaltyCustomer = async (connection, { customerId, email }) => {
  const User = connection.models.User;
  if (!User) return null;
  if (customerId) {
    const user = await User.findById(customerId).select("role").lean();
    if (user?.role === "customer") return user._id;
  }
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const user = await User.findOne({ email: normalized, role: "customer" }).select("_id").lean();
  return user?._id || null;
};

const FIELD = { points: "points", stamps: "stamps" };
// Movimientos que cuentan como "actividad" del cliente (reinician el
// vencimiento y el aviso de vencimiento).
const ACTIVITY_REASONS = ["earn", "redeem"];

// Suma (o resta) al saldo y deja el movimiento. Las restas se recortan para
// no dejar el saldo negativo. → { applied, balance }
const addMovement = async (connection, { customer, program, delta, reason, order = null, appointment = null, note = "", by = null }) => {
  const { LoyaltyAccount, LoyaltyLedger } = connection.models;
  if (!LoyaltyAccount || !customer || !delta) return { applied: 0, balance: null };
  const field = FIELD[program];
  let applied = round2(delta);
  if (applied < 0) {
    const current = (await LoyaltyAccount.findOne({ customer }).select(field).lean())?.[field] || 0;
    applied = -Math.min(-applied, round2(current));
    if (applied === 0) {
      await LoyaltyLedger.create({ customer, program, delta: 0, balanceAfter: round2(current), reason, order, appointment, note: note || "Sin saldo para descontar.", by });
      return { applied: 0, balance: round2(current) };
    }
  }
  const set = ACTIVITY_REASONS.includes(reason) ? { lastActivityAt: new Date(), expiryWarnedAt: null } : {};
  const account = await LoyaltyAccount.findOneAndUpdate(
    { customer },
    { $inc: { [field]: applied }, ...(Object.keys(set).length ? { $set: set } : {}) },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  const balance = round2(account[field]);
  await LoyaltyLedger.create({ customer, program, delta: applied, balanceAfter: balance, reason, order, appointment, note, by });
  return { applied, balance };
};

// Aparta puntos para un canje (atómico: dos pedidos a la vez no gastan el
// mismo saldo). → true si alcanzó.
const reservePoints = async (connection, customer, amount) => {
  const { LoyaltyAccount } = connection.models;
  if (!LoyaltyAccount) return false;
  const account = await LoyaltyAccount.findOneAndUpdate(
    { customer, points: { $gte: amount } },
    { $inc: { points: -amount }, $set: { lastActivityAt: new Date(), expiryWarnedAt: null } },
    { new: true }
  ).lean();
  return Boolean(account);
};

// Deja abonos, reversas y devoluciones de puntos de acuerdo con el pedido
// (ya guardado). `release`: el pedido se va a borrar.
const syncOrderLoyalty = async (Order, connection, order, { release = false } = {}) => {
  if (!connection.models.LoyaltyAccount) return;
  const loyalty = order.loyalty || {};

  // 1) Abono por compra pagada / reversa.
  const shouldEarn = !release && PAID_STATUSES.includes(order.status);
  if (shouldEarn && !loyalty.earnedCounted && (await isProgramActive(connection, "points"))) {
    const customer = await resolveLoyaltyCustomer(connection, { customerId: order.customer, email: order.customerEmail });
    const settings = await getLoyaltySettings(connection);
    const products = (order.items || []).reduce((sum, i) => sum + (Number(i.subtotal) || 0), 0);
    const base = Math.max(0, products - (order.discount?.amount || 0) - (loyalty.redeemed || 0));
    const earned = round2((base * settings.points.earnPercent) / 100);
    if (customer && earned > 0) {
      const flagged = await Order.updateOne(
        { _id: order._id, "loyalty.earnedCounted": { $ne: true } },
        { $set: { "loyalty.earnedCounted": true, "loyalty.earned": earned, "loyalty.customer": customer } }
      );
      if (flagged.modifiedCount === 1) {
        await addMovement(connection, { customer, program: "points", delta: earned, reason: "earn", order: order._id, note: `Pedido #${order.orderNumber}` });
      }
    }
  } else if (!shouldEarn && loyalty.earnedCounted) {
    const flagged = await Order.updateOne({ _id: order._id, "loyalty.earnedCounted": true }, { $set: { "loyalty.earnedCounted": false } });
    if (flagged.modifiedCount === 1) {
      await addMovement(connection, {
        customer: loyalty.customer,
        program: "points",
        delta: -loyalty.earned,
        reason: "reverse",
        order: order._id,
        note: `Pedido #${order.orderNumber} ${release ? "eliminado" : "cancelado o devuelto a pendiente"}`,
      });
    }
  }

  // 2) Puntos usados en el pedido: se devuelven si se cancela o se borra (y
  //    se vuelven a cobrar si se reactiva).
  if (loyalty.redeemed > 0 && loyalty.customer) {
    const shouldHold = !release && order.status !== "cancelled";
    if (!shouldHold && !loyalty.redeemRefunded) {
      const flagged = await Order.updateOne({ _id: order._id, "loyalty.redeemRefunded": { $ne: true } }, { $set: { "loyalty.redeemRefunded": true } });
      if (flagged.modifiedCount === 1) {
        await addMovement(connection, { customer: loyalty.customer, program: "points", delta: loyalty.redeemed, reason: "refund", order: order._id, note: `Pedido #${order.orderNumber} cancelado` });
      }
    } else if (shouldHold && loyalty.redeemRefunded) {
      const flagged = await Order.updateOne({ _id: order._id, "loyalty.redeemRefunded": true }, { $set: { "loyalty.redeemRefunded": false } });
      if (flagged.modifiedCount === 1) {
        await addMovement(connection, { customer: loyalty.customer, program: "points", delta: -loyalty.redeemed, reason: "redeem", order: order._id, note: `Pedido #${order.orderNumber} reactivado` });
      }
    }
  }
};

// Marca y logo de la tienda para los correos de lealtad.
const loadBranding = async (connection) => {
  const StoreConfig = connection.models.StoreConfig;
  const config = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).select("storeName logoUrl theme").lean() : null;
  const backend = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");
  return {
    storeName: config?.storeName || "Duck-Hack",
    logoUrl: backend && config?.logoUrl ? `${backend}/${String(config.logoUrl).replace(/^\/+/, "")}` : undefined,
    accent: config?.theme?.accentColor,
  };
};

// Correo "¡Completaste tu tarjeta!" (best-effort).
const sendRewardEmail = async (connection, customer, settings) => {
  const user = await connection.models.User?.findById(customer).select("name email").lean();
  if (!user?.email) return;
  const { subject, html, text } = loyaltyRewardEmailTemplate({
    branding: await loadBranding(connection),
    name: user.name,
    reward: settings.stamps.reward,
    goal: settings.stamps.goal,
  });
  await notify({ channel: "email", to: user.email, subject, html, text });
};

// Sellos de una cita (ya guardada): +1 al completarse, −1 si deja de estarlo.
// Al completar una tarjeta manda "¡Completaste tu tarjeta!" (`onReward`
// permite reemplazarlo).
const syncAppointmentStamps = async (Appointment, connection, appointment, { onReward = sendRewardEmail } = {}) => {
  const { LoyaltyAccount } = connection.models;
  if (!LoyaltyAccount) return;
  const shouldCount = appointment.status === "completed";
  if (shouldCount && !appointment.loyaltyStampCounted) {
    if (!(await isProgramActive(connection, "stamps"))) return;
    const customer = await resolveLoyaltyCustomer(connection, { customerId: appointment.customer, email: appointment.customerEmail });
    if (!customer) return;
    const flagged = await Appointment.updateOne(
      { _id: appointment._id, loyaltyStampCounted: { $ne: true } },
      { $set: { loyaltyStampCounted: true, loyaltyCustomer: customer } }
    );
    if (flagged.modifiedCount !== 1) return;
    await addMovement(connection, { customer, program: "stamps", delta: 1, reason: "earn", appointment: appointment._id, note: `Cita #${appointment.appointmentNumber}` });
    const settings = await getLoyaltySettings(connection);
    const goal = settings.stamps.goal;
    // Tarjeta completa: los sellos vuelven a empezar y queda un beneficio.
    const full = await LoyaltyAccount.findOneAndUpdate(
      { customer, stamps: { $gte: goal } },
      { $inc: { stamps: -goal, rewardsAvailable: 1 } },
      { new: true }
    ).lean();
    if (full) {
      await connection.models.LoyaltyLedger.create({
        customer, program: "stamps", delta: -goal, balanceAfter: full.stamps, reason: "reward", appointment: appointment._id,
        note: `Tarjeta completa: ${settings.stamps.reward}`,
      });
      if (onReward) {
        Promise.resolve(onReward(connection, customer, settings, full)).catch((error) => {
          console.error("No fue posible enviar el correo de tarjeta completa:", error.message);
        });
      }
    }
  } else if (!shouldCount && appointment.loyaltyStampCounted) {
    const flagged = await Appointment.updateOne({ _id: appointment._id, loyaltyStampCounted: true }, { $set: { loyaltyStampCounted: false } });
    if (flagged.modifiedCount !== 1) return;
    const customer = appointment.loyaltyCustomer;
    const account = await LoyaltyAccount.findOne({ customer }).lean();
    if (account?.stamps >= 1) {
      await addMovement(connection, { customer, program: "stamps", delta: -1, reason: "reverse", appointment: appointment._id, note: `Cita #${appointment.appointmentNumber} ya no está completada` });
    } else if (account?.rewardsAvailable >= 1) {
      // El sello ya se había convertido en beneficio: se retira el beneficio
      // y la tarjeta queda a un sello de la meta.
      const goal = (await getLoyaltySettings(connection)).stamps.goal;
      const updated = await LoyaltyAccount.findOneAndUpdate(
        { customer, rewardsAvailable: { $gte: 1 } },
        { $inc: { rewardsAvailable: -1 }, $set: { stamps: goal - 1 } },
        { new: true }
      ).lean();
      if (updated) {
        await connection.models.LoyaltyLedger.create({
          customer, program: "stamps", delta: goal - 1, balanceAfter: updated.stamps, reason: "reverse", appointment: appointment._id,
          note: `Cita #${appointment.appointmentNumber} ya no está completada: se retira un beneficio`,
        });
      }
    }
  }
};

module.exports = {
  PAID_STATUSES,
  DEFAULT_SETTINGS,
  loadBranding,
  round2,
  getLoyaltySettings,
  isProgramActive,
  resolveLoyaltyCustomer,
  addMovement,
  reservePoints,
  syncOrderLoyalty,
  syncAppointmentStamps,
};
