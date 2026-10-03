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
//
// 3.4 — carrito abandonado (módulo `abandonedCart`): una tarea programada
// (cada 15 min) manda UN correo por abandono a clientes verificados que
// dejaron productos sin cambios por `delayHours` (y menos de 7 días), con
// los productos a precio actual (omite agotados; si todo está agotado no
// manda), botón "Terminar mi compra" (FRONTEND_URL/carrito), cupón opcional
// generado de un solo uso SOLO para ese cliente y enlace para darse de baja
// (User.emailPreferences.abandonedCart). Una vez por abandono: la marca
// `reminderClaimedAt` (claimEach) se borra cuando el carrito vuelve a
// cambiar. Solo corre si `abandonedCart` está contratado y `enabled`.
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const { asFiniteNumber, isValidObjectId, getOrCreateModel, handleMongooseError } = require("../lib/moduleHelpers");
const { getPurchaseLimit, filterInStock } = require("../lib/purchaseLimits");
const { createModuleAuthorizer, isModuleContracted } = require("../lib/permissions");
const { claimEach } = require("../lib/scheduler");
const { notify } = require("../lib/notify");
const { abandonedCartEmailTemplate } = require("../lib/emailTemplates");
const { signEmailPreferencesToken, verifyEmailPreferencesToken } = require("../lib/jwt");

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
    // Marca de "ya se procesó este abandono" (claimEach); se borra cuando el
    // carrito vuelve a cambiar. `remindedAt` = último correo enviado de verdad.
    reminderClaimedAt: { type: Date, default: null },
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
cartSchema.index({ itemsUpdatedAt: 1, reminderClaimedAt: 1 });
cartSchema.index({ remindedAt: -1 });
cartSchema.index({ recoveredAt: -1 });

const COUPON_TYPES = ["amount", "percent", "free_shipping"];
const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  delayHours: 4,
  coupon: { enabled: false, type: "percent", value: 10, minPurchase: null, validDays: 7 },
});
// Un carrito más viejo que esto ya no se recuerda.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const abandonedCartSettingsSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: "default", unique: true, immutable: true },
    enabled: { type: Boolean, default: DEFAULT_SETTINGS.enabled },
    // Horas sin cambios para considerarlo abandonado.
    delayHours: { type: Number, min: 1, max: 72, default: DEFAULT_SETTINGS.delayHours },
    coupon: {
      enabled: { type: Boolean, default: DEFAULT_SETTINGS.coupon.enabled },
      type: { type: String, enum: COUPON_TYPES, default: DEFAULT_SETTINGS.coupon.type },
      value: { type: Number, min: 0, default: DEFAULT_SETTINGS.coupon.value },
      minPurchase: { type: Number, min: 0, default: null },
      validDays: { type: Number, min: 1, max: 60, default: DEFAULT_SETTINGS.coupon.validDays },
    },
  },
  { timestamps: true }
);

const getSettings = async (connection) => {
  const Settings = connection.models.AbandonedCartSettings;
  const doc = Settings ? await Settings.findOne({ singletonKey: "default" }).lean() : null;
  return {
    enabled: doc?.enabled ?? DEFAULT_SETTINGS.enabled,
    delayHours: doc?.delayHours ?? DEFAULT_SETTINGS.delayHours,
    coupon: { ...DEFAULT_SETTINGS.coupon, ...(doc?.coupon || {}) },
  };
};

const validateSettingsPayload = (payload) => {
  const out = {};
  if (payload.enabled !== undefined) out.enabled = Boolean(payload.enabled);
  if (payload.delayHours !== undefined) {
    const n = asFiniteNumber(payload.delayHours);
    if (n === null || !Number.isInteger(n) || n < 1 || n > 72) return { error: "delayHours debe ser un entero de 1 a 72." };
    out.delayHours = n;
  }
  if (payload.coupon !== undefined) {
    const c = payload.coupon || {};
    const coupon = { enabled: Boolean(c.enabled) };
    const type = c.type || "percent";
    if (!COUPON_TYPES.includes(type)) return { error: `coupon.type debe ser uno de: ${COUPON_TYPES.join(", ")}.` };
    coupon.type = type;
    const value = type === "free_shipping" ? 0 : asFiniteNumber(c.value);
    if (type !== "free_shipping" && (value === null || value <= 0 || (type === "percent" && value > 100))) {
      return { error: type === "percent" ? "El porcentaje va de 1 a 100." : "El monto debe ser mayor a 0." };
    }
    coupon.value = value;
    if (c.minPurchase === null || c.minPurchase === "" || c.minPurchase === undefined) coupon.minPurchase = null;
    else {
      const min = asFiniteNumber(c.minPurchase);
      if (min === null || min < 0) return { error: "coupon.minPurchase debe ser un número >= 0." };
      coupon.minPurchase = min;
    }
    const days = asFiniteNumber(c.validDays ?? 7);
    if (days === null || !Number.isInteger(days) || days < 1 || days > 60) return { error: "coupon.validDays debe ser un entero de 1 a 60." };
    coupon.validDays = days;
    out.coupon = coupon;
  }
  return { settings: out };
};

const couponLabel = ({ type, value }) =>
  type === "free_shipping" ? "Envío gratis" : type === "percent" ? `${value}% de descuento` : `$${Number(value).toLocaleString("es-MX")} de descuento`;

// VUELVE-7K2PQX (sin letras que se confunden).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const randomCode = () => `VUELVE-${Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("")}`;

const escapeHtml = (value = "") => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Página mínima (el backend no tiene vistas): darse de baja en dos pasos —el
// enlace del correo muestra un botón y el botón hace POST— para que un
// antivirus que abre los enlaces no dé de baja a nadie.
const unsubscribePage = ({ title, message, token, storeName }) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title>
<style>body{margin:0;font-family:Helvetica,Arial,sans-serif;background:#f6f3ef;color:#1a1a1a;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
main{max-width:440px;background:#fff;border-radius:14px;padding:32px;box-shadow:0 8px 30px #0001;text-align:center}h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;color:#555}
button{margin-top:16px;padding:12px 22px;border:0;border-radius:999px;background:#333;color:#fff;font-size:15px;cursor:pointer}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
${token ? `<form method="post"><input type="hidden" name="token" value="${escapeHtml(token)}" /><button type="submit">Sí, no quiero recibirlos</button></form>` : ""}
<p style="font-size:12px;margin-top:20px">${escapeHtml(storeName || "")}</p></main></body></html>`;

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

// La tarea la arma registerRoutes (tiene los helpers) y la registra
// registerJobs (server.js llama primero a registerRoutes).
const abandonedCartRunners = new WeakMap();

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

  const Settings = getOrCreateModel(mongooseConnection, "AbandonedCartSettings", abandonedCartSettingsSchema);
  const storeNameOf = async () => {
    const StoreConfig = mongooseConnection.models.StoreConfig;
    const config = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).select("storeName").lean() : null;
    return config?.storeName || "";
  };

  // ---- Darse de baja (público, con el token del correo) ----
  router.get("/unsubscribe", async (req, res) => {
    const storeName = await storeNameOf().catch(() => "");
    try {
      verifyEmailPreferencesToken(String(req.query.token || ""));
    } catch {
      return res.status(400).type("html").send(unsubscribePage({ title: "Enlace no válido", message: "Este enlace no es válido o ya venció.", storeName }));
    }
    return res.status(200).type("html").send(
      unsubscribePage({
        title: "¿Dejar de recibir recordatorios?",
        message: "Ya no te mandaremos correos cuando dejes productos en tu carrito. Los avisos de tus pedidos siguen llegando.",
        token: String(req.query.token),
        storeName,
      })
    );
  });

  router.post("/unsubscribe", express.urlencoded({ extended: false }), async (req, res) => {
    const storeName = await storeNameOf().catch(() => "");
    let decoded;
    try {
      decoded = verifyEmailPreferencesToken(String(req.body?.token || ""));
    } catch {
      return res.status(400).type("html").send(unsubscribePage({ title: "Enlace no válido", message: "Este enlace no es válido o ya venció.", storeName }));
    }
    const User = mongooseConnection.models.User;
    if (User && decoded.pref === "abandonedCart") {
      await User.updateOne({ _id: decoded.uid }, { $set: { "emailPreferences.abandonedCart": false } });
    }
    return res.status(200).type("html").send(
      unsubscribePage({ title: "Listo", message: "Ya no recibirás recordatorios de carrito. Puedes volver a activarlos desde tu cuenta.", storeName })
    );
  });

  router.use(verifyToken);

  // ---- Admin: ajustes y cifras (módulo abandonedCart) ----
  const canManage = createModuleAuthorizer({ mongooseConnection, sendError }).authorizeModule("abandonedCart");

  router.get("/abandoned/settings", canManage, async (req, res) => {
    try {
      return res.status(200).json(await getSettings(mongooseConnection));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar los ajustes.");
    }
  });

  router.put("/abandoned/settings", canManage, async (req, res) => {
    try {
      const { settings, error } = validateSettingsPayload(req.body || {});
      if (error) return sendError(res, 400, "VALIDATION_ERROR", error);
      const update = {};
      if (settings.enabled !== undefined) update.enabled = settings.enabled;
      if (settings.delayHours !== undefined) update.delayHours = settings.delayHours;
      if (settings.coupon) update.coupon = settings.coupon;
      await Settings.updateOne({ singletonKey: "default" }, { $set: update }, { upsert: true, runValidators: true });
      return res.status(200).json({ message: "Ajustes guardados.", settings: await getSettings(mongooseConnection) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al guardar los ajustes.");
    }
  });

  // Últimos 30 días: correos enviados, compras recuperadas y monto; carritos
  // que hoy cumplen para recordatorio; los 20 recordatorios más recientes.
  router.get("/abandoned/stats", canManage, async (req, res) => {
    try {
      const settings = await getSettings(mongooseConnection);
      const now = Date.now();
      const since = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const [sent, recoveredAgg, waiting, recent] = await Promise.all([
        Cart.countDocuments({ remindedAt: { $gte: since } }),
        Cart.aggregate([{ $match: { recoveredAt: { $gte: since } } }, { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$recoveredTotal" } } }]),
        Cart.countDocuments({
          "items.0": { $exists: true },
          reminderClaimedAt: null,
          itemsUpdatedAt: { $lte: new Date(now - settings.delayHours * 3600000), $gte: new Date(now - MAX_AGE_MS) },
        }),
        Cart.find({ remindedAt: { $ne: null } }).sort({ remindedAt: -1 }).limit(20).populate("customer", "name email").lean(),
      ]);
      return res.status(200).json({
        last30Days: { sent, recovered: recoveredAgg[0]?.count || 0, recoveredTotal: recoveredAgg[0]?.total || 0 },
        waiting,
        recent: recent.map((c) => ({
          _id: c._id,
          customer: c.customer ? { name: c.customer.name, email: c.customer.email } : null,
          remindedAt: c.remindedAt,
          coupon: c.reminderCoupon || "",
          items: c.items.length,
          recoveredAt: c.recoveredAt && c.recoveredAt >= c.remindedAt ? c.recoveredAt : null,
          recoveredTotal: c.recoveredAt && c.recoveredAt >= c.remindedAt ? c.recoveredTotal : null,
        })),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar las cifras.");
    }
  });

  // ---- Tarea programada: recordatorios de carrito abandonado ----
  const runAbandonedCarts = async ({ now = new Date() } = {}) => {
    if (!(await isModuleContracted(mongooseConnection, "abandonedCart"))) return { skipped: "not_contracted" };
    const settings = await getSettings(mongooseConnection);
    if (!settings.enabled) return { skipped: "disabled" };
    return claimEach({
      Model: Cart,
      filter: {
        "items.0": { $exists: true },
        itemsUpdatedAt: { $lte: new Date(+now - settings.delayHours * 3600000), $gte: new Date(+now - MAX_AGE_MS) },
      },
      markField: "reminderClaimedAt",
      attemptsField: "reminderAttempts",
      sort: { itemsUpdatedAt: 1 },
      now,
      handle: (cart) => sendReminder(cart, settings),
    });
  };

  // Manda el correo (o nada si no aplica: cuenta no verificada, se dio de
  // baja, todo agotado). Si el envío falla, borra el cupón que generó y
  // lanza (claimEach libera la marca y reintenta).
  const sendReminder = async (cart, settings) => {
    const User = mongooseConnection.models.User;
    const Coupon = mongooseConnection.models.Coupon;
    const user = User ? await User.findById(cart.customer).select("name email role isVerified emailPreferences").lean() : null;
    if (!user || user.role !== "customer" || !user.isVerified || user.emailPreferences?.abandonedCart === false) return;

    const { items } = await resolveItems(cart.items);
    if (!items.length) return;
    const backend = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");
    const frontend = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
    const lines = items.map(({ product, variant, quantity }) => {
      const v = variant ? product.variants.find((x) => String(x._id) === String(variant)) : null;
      const image = (v && v.image) || product.images?.[0] || "";
      return {
        name: product.name,
        variantLabel: v?.label || "",
        qty: Math.min(quantity, v ? v.maxQty : product.maxQty) || quantity,
        price: Number(v ? v.price : product.price),
        imageUrl: backend && image ? `${backend}/${String(image).replace(/^\/+/, "")}` : "",
      };
    });
    const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0);

    const StoreConfig = mongooseConnection.models.StoreConfig;
    const config = StoreConfig ? await StoreConfig.findOne({ singletonKey: "default" }).select("storeName logoUrl theme").lean() : null;
    const branding = {
      storeName: config?.storeName || "Duck-Hack",
      logoUrl: backend && config?.logoUrl ? `${backend}/${String(config.logoUrl).replace(/^\/+/, "")}` : undefined,
      accent: config?.theme?.accentColor,
    };

    let coupon = null;
    if (settings.coupon.enabled && Coupon) {
      const endsAt = new Date(Date.now() + settings.coupon.validDays * 24 * 60 * 60 * 1000);
      for (let attempt = 0; attempt < 5 && !coupon; attempt += 1) {
        try {
          coupon = await Coupon.create({
            code: randomCode(),
            description: `Carrito abandonado de ${user.email}`,
            type: settings.coupon.type,
            value: settings.coupon.type === "free_shipping" ? 0 : settings.coupon.value,
            minPurchase: settings.coupon.minPurchase,
            endsAt,
            maxUses: 1,
            maxUsesPerCustomer: 1,
            customerEmail: user.email,
            source: "abandoned_cart",
          });
        } catch (error) {
          if (error?.code !== 11000) throw error; // código repetido: otro intento
        }
      }
    }

    const unsubscribeUrl = backend
      ? `${backend}/api/cart/unsubscribe?token=${encodeURIComponent(signEmailPreferencesToken({ userId: user._id, preference: "abandonedCart" }))}`
      : null;
    const { subject, html, text } = abandonedCartEmailTemplate({
      branding,
      name: user.name,
      items: lines,
      total,
      cartUrl: frontend ? `${frontend}/carrito` : null,
      coupon: coupon
        ? {
            code: coupon.code,
            label: couponLabel(coupon),
            endsAt: new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(coupon.endsAt),
          }
        : null,
      unsubscribeUrl,
    });
    try {
      await notify({ channel: "email", to: user.email, subject, html, text });
    } catch (error) {
      if (coupon) await Coupon.deleteOne({ _id: coupon._id }).catch(() => {});
      throw error;
    }
    await Cart.updateOne(
      { _id: cart._id },
      { $set: { remindedAt: new Date(), reminderCoupon: coupon?.code || "" }, $inc: { reminderCount: 1 } }
    );
  };
  abandonedCartRunners.set(mongooseConnection, runAbandonedCarts);

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
            // Un cambio es un abandono nuevo: se puede volver a recordar.
            { $set: { items, itemsUpdatedAt: new Date(), reminderClaimedAt: null, reminderAttempts: 0 } },
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
      await Cart.updateOne({ customer: req.user.id }, { $set: { items: [], itemsUpdatedAt: new Date(), reminderClaimedAt: null, reminderAttempts: 0 } });
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

// Tareas programadas (lib/scheduler.js): carrito abandonado cada 15 min.
function registerJobs(scheduler, ctx) {
  const run = abandonedCartRunners.get(ctx.mongooseConnection);
  if (run) scheduler.register("abandoned-carts", 15 * 60 * 1000, run);
}

module.exports = {
  name: "cart",
  registerRoutes,
  registerJobs,
  models: { Cart: cartSchema, AbandonedCartSettings: abandonedCartSettingsSchema },
  settleCartAfterOrder,
};
