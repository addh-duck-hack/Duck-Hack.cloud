// Tarjetas de regalo (Fase 5.2): lo que comparten el módulo giftCards, el
// checkout de pedidos (modules/orders.js) y el anticipo de citas
// (modules/appointments.js). El saldo es dinero (pesos) y se usa en partes.
//
// Cargo y abono son atómicos sobre el documento (`balance` con $gte en el
// filtro), así dos pedidos simultáneos no pueden gastar el mismo saldo. Cada
// movimiento queda en `movements` (compra, canje, devolución, ajuste…).
const crypto = require("crypto");

// Sin 0/O, 1/I/L: se dicta por teléfono sin confusiones.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_PREFIX = "GC";

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const generateCode = () => {
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${CODE_PREFIX}-${chars.slice(0, 4)}-${chars.slice(4)}`;
};

// "gc 7kq2 m9xw", "GC7KQ2M9XW" o "GC-7KQ2-M9XW" → "GC-7KQ2-M9XW" (o "" si no tiene forma de código).
const normalizeCode = (value) => {
  const raw = String(value || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (raw.length !== CODE_PREFIX.length + 8 || !raw.startsWith(CODE_PREFIX)) return "";
  const body = raw.slice(CODE_PREFIX.length);
  return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
};

const isExpired = (card, now = new Date()) => card.status === "expired" || (card.expiresAt && +card.expiresAt <= +now);

// Tarjeta lista para usarse por su código → { card } o { error }.
const findUsableCard = async (connection, rawCode, { now = new Date() } = {}) => {
  const GiftCard = connection.models.GiftCard;
  const code = normalizeCode(rawCode);
  const notFound = { error: { status: 404, code: "GIFT_CARD_NOT_FOUND", message: "No encontramos esa tarjeta de regalo. Revisa el código." } };
  if (!GiftCard || !code) return notFound;
  const card = await GiftCard.findOne({ code }).lean();
  if (!card) return notFound;
  if (card.status === "pending_payment") {
    return { error: { status: 409, code: "GIFT_CARD_NOT_ACTIVE", message: "Esta tarjeta todavía no está activa: falta confirmar su pago." } };
  }
  if (card.status === "cancelled") return { error: { status: 409, code: "GIFT_CARD_CANCELLED", message: "Esta tarjeta de regalo fue cancelada." } };
  if (isExpired(card, now)) return { error: { status: 409, code: "GIFT_CARD_EXPIRED", message: "Esta tarjeta de regalo ya venció." } };
  if (!(card.balance > 0)) return { error: { status: 409, code: "GIFT_CARD_EMPTY", message: "Esta tarjeta de regalo ya no tiene saldo." } };
  return { card };
};

// Cobra `amount` de la tarjeta si alcanza el saldo y sigue vigente. → tarjeta
// actualizada o null (no alcanzó, venció o cambió de estado entre tanto).
const debitCard = async (connection, cardId, amount, movement = {}) => {
  const GiftCard = connection.models.GiftCard;
  const value = round2(amount);
  if (!GiftCard || !(value > 0)) return null;
  const now = new Date();
  const updated = await GiftCard.findOneAndUpdate(
    { _id: cardId, status: "active", balance: { $gte: value }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
    { $inc: { balance: -value }, $push: { movements: { type: "redeem", ...movement, delta: -value, at: now } } },
    { new: true }
  );
  if (!updated) return null;
  if (updated.balance <= 0.004) {
    return GiftCard.findOneAndUpdate({ _id: cardId, status: "active", balance: { $lte: 0.004 } }, { $set: { status: "used", balance: 0 } }, { new: true }).then((doc) => doc || updated);
  }
  return updated;
};

// Regresa `amount` a la tarjeta (pedido cancelado, ajuste). Si estaba
// agotada vuelve a activa; si ya venció, el saldo regresa pero sigue vencida.
const creditCard = async (connection, cardId, amount, movement = {}) => {
  const GiftCard = connection.models.GiftCard;
  const value = round2(amount);
  if (!GiftCard || !(value > 0)) return null;
  const now = new Date();
  const updated = await GiftCard.findOneAndUpdate(
    { _id: cardId, status: { $in: ["active", "used", "expired"] } },
    { $inc: { balance: value }, $push: { movements: { type: "refund", ...movement, delta: value, at: now } } },
    { new: true }
  );
  if (updated && updated.status === "used" && !isExpired(updated, now)) {
    return GiftCard.findOneAndUpdate({ _id: cardId, status: "used" }, { $set: { status: "active" } }, { new: true }).then((doc) => doc || updated);
  }
  return updated;
};

// Pedido con tarjeta (Order.giftCard): el saldo usado se devuelve si el
// pedido se cancela o se borra, y se vuelve a cobrar si se reactiva (si ya no
// alcanza, queda sin cobrar y se avisa en el log — el staff lo ve en el pedido).
const syncOrderGiftCard = async (Order, connection, order, { release = false } = {}) => {
  const gift = order.giftCard || {};
  if (!(gift.amount > 0) || !gift.card) return;
  const shouldHold = !release && order.status !== "cancelled";
  const note = `Pedido #${order.orderNumber}`;
  if (!shouldHold && !gift.refunded) {
    const flagged = await Order.updateOne({ _id: order._id, "giftCard.refunded": { $ne: true } }, { $set: { "giftCard.refunded": true } });
    if (flagged.modifiedCount === 1) await creditCard(connection, gift.card, gift.amount, { order: order._id, note: `${note} ${release ? "eliminado" : "cancelado"}` });
  } else if (shouldHold && gift.refunded) {
    const charged = await debitCard(connection, gift.card, gift.amount, { order: order._id, note: `${note} reactivado` });
    if (charged) await Order.updateOne({ _id: order._id }, { $set: { "giftCard.refunded": false } });
    else console.error(`La tarjeta ${gift.code} ya no alcanza para volver a cobrar el ${note}.`);
  }
};

module.exports = {
  CODE_PREFIX,
  round2,
  generateCode,
  normalizeCode,
  isExpired,
  findUsableCard,
  debitCard,
  creditCard,
  syncOrderGiftCard,
};
