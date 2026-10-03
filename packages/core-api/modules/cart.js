// Carrito guardado en el servidor para clientes con sesión (`/api/cart`;
// Fase 3.3 del Roadmap de cotizaciones, Obsidian "Fase 3 - Tareas
// programadas"). Sin sesión el carrito sigue viviendo en el navegador; con
// sesión el storefront lo une con el guardado al iniciar sesión y guarda
// cada cambio, así sobrevive entre dispositivos y permite el correo de
// carrito abandonado (3.4).
//
// Es infraestructura: no depende de permisos (cualquier usuario con sesión
// tiene su carrito). El checkout con sesión (modules/orders.js#POST /public)
// lo vacía y, si ya se le había mandado recordatorio, marca la venta como
// recuperada.
//
// `itemsUpdatedAt` cambia SOLO cuando cambian los productos (no con las
// marcas del recordatorio): es lo que mide cuánto lleva abandonado.
const express = require("express");
const mongoose = require("mongoose");
const { asFiniteNumber, isValidObjectId, getOrCreateModel } = require("../lib/moduleHelpers");
const { getPurchaseLimit, filterInStock } = require("../lib/purchaseLimits");

const MAX_LINES = 50;
const MAX_QTY = 999;

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variant: { type: mongoose.Schema.Types.ObjectId, default: null },
    quantity: { type: Number, required: true, min: 1, max: MAX_QTY },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
    itemsUpdatedAt: { type: Date, default: Date.now },
    // Carrito abandonado (3.4): marca del último recordatorio, intentos,
    // cupón generado y venta recuperada.
    remindedAt: { type: Date, default: null },
    reminderAttempts: { type: Number, default: 0 },
    reminderCount: { type: Number, default: 0 },
    reminderCoupon: { type: String, default: "" },
    recoveredAt: { type: Date, default: null },
    recoveredOrder: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    recoveredTotal: { type: Number, default: null },
  },
  { timestamps: true }
);
cartSchema.index({ itemsUpdatedAt: 1, remindedAt: 1 });

const keyOf = (item) => `${item.product}:${item.variant || ""}`;

// Payload { items: [{ product, variant?, quantity }] } → renglones normalizados
// (mismo producto + variante se suman) o { error }.
const normalizeItems = (rawItems) => {
  if (!Array.isArray(rawItems)) return { error: "items debe ser una lista." };
  const merged = new Map();
  for (const raw of rawItems) {
    if (!isValidObjectId(raw?.product)) return { error: "Cada renglón necesita un product válido." };
    const variant = raw.variant === undefined || raw.variant === null || raw.variant === "" ? null : raw.variant;
    if (variant !== null && !isValidObjectId(variant)) return { error: "variant no es válido." };
    const quantity = asFiniteNumber(raw.quantity);
    if (quantity === null || !Number.isInteger(quantity) || quantity < 1) return { error: "quantity debe ser un entero mayor o igual a 1." };
    const item = { product: String(raw.product), variant: variant ? String(variant) : null, quantity };
    const key = keyOf(item);
    const prev = merged.get(key);
    merged.set(key, { ...item, quantity: Math.min(MAX_QTY, (prev?.quantity || 0) + quantity) });
  }
  if (merged.size > MAX_LINES) return { error: `El carrito admite hasta ${MAX_LINES} productos distintos.` };
  return { items: [...merged.values()] };
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Cart = getOrCreateModel(mongooseConnection, "Cart", cartSchema);
  const router = express.Router();

  // Renglones con los datos del producto como los da el catálogo público
  // (filterInStock: activo, con existencias, variantes y topes). Lo que ya no
  // se puede comprar va en `unavailable` (el carrito guardado no se toca).
  const resolveItems = async (items) => {
    const Product = mongooseConnection.models.Product;
    const Inventory = mongooseConnection.models.Inventory;
    if (!items.length || !Product) return { items: [], unavailable: items.map((i) => ({ product: String(i.product), variant: i.variant ? String(i.variant) : null })) };
    const ids = [...new Set(items.map((i) => String(i.product)))];
    const products = await Product.find({ _id: { $in: ids }, isActive: true }).populate("category", "name slug").lean();
    const available = await filterInStock(Inventory, products, await getPurchaseLimit(mongooseConnection));
    const byId = new Map(available.map((p) => [String(p._id), p]));
    const out = [];
    const unavailable = [];
    for (const item of items) {
      const product = byId.get(String(item.product));
      const ref = { product: String(item.product), variant: item.variant ? String(item.variant) : null };
      const hasVariants = Boolean(product?.variants?.length);
      const variant = hasVariants && item.variant ? product.variants.find((v) => String(v._id) === String(item.variant)) : null;
      // Producto sin existencias / inactivo, variante que ya no existe o
      // agotada, o renglón sin variante de un producto que ahora las tiene.
      if (!product || (hasVariants && (!variant || !variant.inStock)) || (!hasVariants && item.variant)) {
        unavailable.push(ref);
        continue;
      }
      out.push({ ...ref, quantity: item.quantity, product });
    }
    return { items: out, unavailable };
  };

  const respond = async (res, cart) => {
    const { items, unavailable } = await resolveItems(cart?.items || []);
    return res.status(200).json({ items, unavailable, updatedAt: cart?.itemsUpdatedAt || null });
  };

  router.use(verifyToken);

  router.get("/", async (req, res) => {
    try {
      const cart = await Cart.findOne({ customer: req.user.id }).lean();
      return respond(res, cart);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar el carrito.");
    }
  });

  // Reemplaza el carrito completo. Solo cuenta como "cambio" (itemsUpdatedAt)
  // si de verdad cambiaron productos o cantidades.
  router.put("/", async (req, res) => {
    try {
      const { items, error } = normalizeItems(req.body?.items);
      if (error) return sendError(res, 400, "VALIDATION_ERROR", error);
      const current = await Cart.findOne({ customer: req.user.id }).lean();
      const sameAs = (a, b) =>
        a.length === b.length &&
        a.every((x) => b.some((y) => keyOf(y) === keyOf({ product: String(x.product), variant: x.variant ? String(x.variant) : null }) && y.quantity === x.quantity));
      const changed = !current || !sameAs(current.items, items);
      const cart = changed
        ? await Cart.findOneAndUpdate(
            { customer: req.user.id },
            { $set: { items, itemsUpdatedAt: new Date() } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
          ).lean()
        : current;
      return respond(res, cart);
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al guardar el carrito.");
    }
  });

  router.delete("/", async (req, res) => {
    try {
      await Cart.updateOne({ customer: req.user.id }, { $set: { items: [], itemsUpdatedAt: new Date() } });
      return res.status(200).json({ items: [], unavailable: [], updatedAt: new Date() });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al vaciar el carrito.");
    }
  });

  app.use("/api/cart", router);
}

// Lo llama el checkout con sesión (modules/orders.js) después de guardar el
// pedido: vacía el carrito y, si se le mandó recordatorio en los últimos 7
// días, lo marca como venta recuperada. Nunca lanza (no debe tumbar el pedido).
const RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const settleCartAfterOrder = async (connection, { customerId, order }) => {
  const Cart = connection.models.Cart;
  if (!Cart || !customerId) return;
  try {
    const cart = await Cart.findOne({ customer: customerId }).select("remindedAt recoveredAt").lean();
    if (!cart) return;
    // Una venta recuperada por recordatorio (no cuenta dos veces el mismo).
    const recovered =
      cart.remindedAt &&
      Date.now() - new Date(cart.remindedAt) <= RECOVERY_WINDOW_MS &&
      !(cart.recoveredAt && new Date(cart.recoveredAt) >= new Date(cart.remindedAt));
    await Cart.updateOne(
      { _id: cart._id },
      {
        $set: {
          items: [],
          itemsUpdatedAt: new Date(),
          ...(recovered ? { recoveredAt: new Date(), recoveredOrder: order._id, recoveredTotal: order.total } : {}),
        },
      }
    );
  } catch (error) {
    console.error("No fue posible vaciar el carrito después del pedido:", error.message);
  }
};

module.exports = {
  name: "cart",
  registerRoutes,
  models: { Cart: cartSchema },
  settleCartAfterOrder,
};
