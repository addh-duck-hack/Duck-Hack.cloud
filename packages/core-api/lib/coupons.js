// Cupones de descuento (Fase 1 del Roadmap de cotizaciones, Obsidian
// "Fase 1 - Tienda P2"). Una sola regla para validar un cupón: la usan
// POST /api/coupons/validate (vista previa en la canasta, modules/coupons.js)
// y el checkout (POST /api/orders/public, modules/orders.js), que es el que
// manda: el total siempre se recalcula en el servidor.
//
// Tipos: "amount" (monto fijo), "percent" (porcentaje del subtotal de
// productos) y "free_shipping" (el envío sale en $0). El descuento nunca pasa
// del subtotal de productos.
//
// Usos: se apartan al crear el pedido (reserveCouponUse, atómico, no deja
// pasar de maxUses aunque lleguen pedidos al mismo tiempo) y se liberan si el
// pedido se cancela o se borra (syncCouponUse, mismo patrón que el
// inventario: un marcador en el pedido, Order.discount.counted).

const round2 = (value) => Math.round(value * 100) / 100;

const normalizeCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const couponError = (status, code, message) => ({ error: { status, code, message } });

// Valida un cupón contra un pedido. `subtotal` = subtotal de productos (ya con
// sus precios con descuento); `customerEmail` para el límite por cliente.
// Devuelve { coupon, discount, freeShipping } o { error }.
const resolveCoupon = async (connection, rawCode, { subtotal, customerEmail, deliveryMethod, now = new Date() }) => {
  const { Coupon, Order } = connection.models;
  const code = normalizeCode(rawCode);
  if (!code) return couponError(400, "COUPON_REQUIRED", "Escribe el código del cupón.");
  if (!Coupon) return couponError(400, "COUPONS_NOT_AVAILABLE", "Esta tienda no tiene cupones.");

  const coupon = await Coupon.findOne({ code }).lean();
  if (!coupon || coupon.isActive === false) return couponError(404, "COUPON_NOT_FOUND", "Ese cupón no existe o ya no está activo.");
  if (coupon.startsAt && now < new Date(coupon.startsAt)) return couponError(400, "COUPON_NOT_STARTED", "Ese cupón todavía no está vigente.");
  if (coupon.endsAt && now > new Date(coupon.endsAt)) return couponError(400, "COUPON_EXPIRED", "Ese cupón ya venció.");

  const base = Math.max(0, Number(subtotal) || 0);
  if (coupon.minPurchase && base < coupon.minPurchase) {
    return couponError(400, "COUPON_MIN_PURCHASE", `Este cupón aplica en compras desde $${coupon.minPurchase.toLocaleString("es-MX")}.`);
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    return couponError(409, "COUPON_EXHAUSTED", "Ese cupón ya se usó el máximo de veces.");
  }
  // Cupón personal (p. ej. el del correo de carrito abandonado).
  const buyer = String(customerEmail || "").trim().toLowerCase();
  if (coupon.customerEmail && buyer !== coupon.customerEmail) {
    return couponError(403, "COUPON_NOT_FOR_YOU", "Este cupón es personal: úsalo con el correo al que te llegó (inicia sesión con esa cuenta).");
  }
  if (coupon.type === "free_shipping" && deliveryMethod === "pickup") {
    return couponError(400, "COUPON_NOT_APPLICABLE", "Ese cupón es de envío gratis y tu pedido es para recoger.");
  }

  const email = String(customerEmail || "").trim().toLowerCase();
  if (coupon.maxUsesPerCustomer && email && Order) {
    const used = await Order.countDocuments({ "discount.coupon": coupon._id, customerEmail: email, "discount.counted": true });
    if (used >= coupon.maxUsesPerCustomer) {
      return couponError(409, "COUPON_LIMIT_PER_CUSTOMER", "Ya usaste este cupón el máximo de veces permitido.");
    }
  }

  let discount = 0;
  if (coupon.type === "amount") discount = Math.min(coupon.value, base);
  if (coupon.type === "percent") discount = Math.min(round2((base * coupon.value) / 100), base);
  return { coupon, discount: round2(discount), freeShipping: coupon.type === "free_shipping" };
};

// Aparta un uso. false si se acabaron (otro pedido ganó el último).
const reserveCouponUse = async (Coupon, couponId) => {
  const result = await Coupon.updateOne(
    {
      _id: couponId,
      $or: [{ maxUses: null }, { maxUses: { $exists: false } }, { $expr: { $lt: ["$usedCount", "$maxUses"] } }],
    },
    { $inc: { usedCount: 1 } }
  );
  return result.modifiedCount === 1;
};

// Deja el conteo de usos de acuerdo con el pedido (ya guardado): un pedido
// cancelado (o que se borra, `release`) no cuenta. El marcador
// Order.discount.counted cambia de forma atómica; si un pedido cancelado se
// reactiva, vuelve a contar aunque eso pase de maxUses (la venta ya existía).
const syncCouponUse = async (Order, connection, order, { release = false } = {}) => {
  const couponId = order.discount?.coupon;
  const Coupon = connection.models.Coupon;
  if (!couponId || !Coupon) return;
  const shouldCount = !release && order.status !== "cancelled";
  const result = await Order.updateOne(
    { _id: order._id, "discount.counted": shouldCount ? { $ne: true } : true },
    { $set: { "discount.counted": shouldCount } }
  );
  if (result.modifiedCount !== 1) return;
  order.discount.counted = shouldCount;
  await Coupon.updateOne({ _id: couponId }, { $inc: { usedCount: shouldCount ? 1 : -1 } });
};

module.exports = { normalizeCode, resolveCoupon, reserveCouponUse, syncCouponUse };
