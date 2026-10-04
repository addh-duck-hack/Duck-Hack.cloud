// Aviso "volvió a estar disponible" (`/api/wishlist`, clave de permisos
// `wishlist`). Fase 4.3 del Roadmap de cotizaciones (Obsidian "Fase 4 -
// Fidelizacion"). Los favoritos ya existen (User.favorites, modules/auth.js);
// esto avisa por correo cuando uno agotado vuelve a tener existencias.
//
// - Una tarea programada (cada 15 min) revisa SOLO los productos que alguien
//   tiene en favoritos y guarda su estado en `ProductStockState` (disponible =
//   activo y con existencias, el mismo criterio que /api/products/public vía
//   lib/purchaseLimits.js#filterInStock). La primera vez solo registra el
//   estado; así no importa desde dónde cambió el inventario (admin, pedido
//   cancelado, script…).
// - Al pasar de agotado a disponible (cambio atómico del estado, una sola
//   corrida lo ve) se crea un `WishlistNotice` por cliente que lo tiene en
//   favoritos (único por cliente + producto + reabastecimiento) y se mandan
//   con claimEach (`sentAt`). Si al mandarlo ya se volvió a agotar, no se
//   manda (`skipped`).
// - Solo clientes verificados que no se dieron de baja
//   (`User.emailPreferences.wishlist`, enlace del propio correo → GET/POST
//   /unsubscribe con JWT `email_preferences` pref "wishlist").
// - Corre solo si `wishlist` está contratado y `enabled`.
// - El botón lleva a FRONTEND_URL/tienda/<productId> (contrato del storefront).
const express = require("express");
const mongoose = require("mongoose");
const { getOrCreateModel, handleMongooseError } = require("../lib/moduleHelpers");
const { getPurchaseLimit, filterInStock } = require("../lib/purchaseLimits");
const { createModuleAuthorizer, isModuleContracted } = require("../lib/permissions");
const { claimEach } = require("../lib/scheduler");
const { notify } = require("../lib/notify");
const { wishlistBackInStockEmailTemplate } = require("../lib/emailTemplates");
const { signEmailPreferencesToken, verifyEmailPreferencesToken } = require("../lib/jwt");
const { unsubscribePage } = require("./cart");

const DEFAULT_SETTINGS = Object.freeze({ enabled: true });
// Un aviso que no se pudo mandar en este plazo ya no se manda.
const NOTICE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const PRODUCT_PAGE_PATH = "/tienda";

const wishlistSettingsSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: "default", unique: true, immutable: true },
    enabled: { type: Boolean, default: DEFAULT_SETTINGS.enabled },
  },
  { timestamps: true }
);

const productStockStateSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, unique: true },
    available: { type: Boolean, required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const wishlistNoticeSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // changedAt del reabastecimiento que lo originó: uno por cliente y vez.
    restockAt: { type: Date, required: true },
    sentAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    // Se tomó pero no se mandó (se dio de baja, ya no está en favoritos, se
    // volvió a agotar…).
    skipped: { type: String, default: "" },
  },
  { timestamps: true }
);
wishlistNoticeSchema.index({ customer: 1, product: 1, restockAt: 1 }, { unique: true });
wishlistNoticeSchema.index({ sentAt: 1, createdAt: 1 });

const getSettings = async (connection) => {
  const Settings = connection.models.WishlistSettings;
  const doc = Settings ? await Settings.findOne({ singletonKey: "default" }).lean() : null;
  return { enabled: doc?.enabled ?? DEFAULT_SETTINGS.enabled };
};

// La tarea la arma registerRoutes y la registra registerJobs.
const wishlistRunners = new WeakMap();

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const Settings = getOrCreateModel(mongooseConnection, "WishlistSettings", wishlistSettingsSchema);
  const StockState = getOrCreateModel(mongooseConnection, "ProductStockState", productStockStateSchema);
  const Notice = getOrCreateModel(mongooseConnection, "WishlistNotice", wishlistNoticeSchema);
  const router = express.Router();

  const storeConfigOf = async () => {
    const StoreConfig = mongooseConnection.models.StoreConfig;
    return StoreConfig ? StoreConfig.findOne({ singletonKey: "default" }).select("storeName logoUrl theme").lean() : null;
  };

  // Productos disponibles (activos y con existencias) de una lista de ids.
  const availableProducts = async (ids) => {
    const Product = mongooseConnection.models.Product;
    if (!Product || !ids.length) return [];
    const products = await Product.find({ _id: { $in: ids }, isActive: true }).lean();
    return filterInStock(mongooseConnection.models.Inventory, products, await getPurchaseLimit(mongooseConnection));
  };

  // ---- Darse de baja (público, con el token del correo) ----
  router.get("/unsubscribe", async (req, res) => {
    const storeName = (await storeConfigOf().catch(() => null))?.storeName || "";
    try {
      verifyEmailPreferencesToken(String(req.query.token || ""));
    } catch {
      return res.status(400).type("html").send(unsubscribePage({ title: "Enlace no válido", message: "Este enlace no es válido o ya venció.", storeName }));
    }
    return res.status(200).type("html").send(
      unsubscribePage({
        title: "¿Dejar de recibir estos avisos?",
        message: "Ya no te avisaremos cuando un producto de tus favoritos vuelva a estar disponible. Los correos de tus pedidos siguen llegando.",
        token: String(req.query.token),
        storeName,
      })
    );
  });

  router.post("/unsubscribe", express.urlencoded({ extended: false }), async (req, res) => {
    const storeName = (await storeConfigOf().catch(() => null))?.storeName || "";
    let decoded;
    try {
      decoded = verifyEmailPreferencesToken(String(req.body?.token || ""));
    } catch {
      return res.status(400).type("html").send(unsubscribePage({ title: "Enlace no válido", message: "Este enlace no es válido o ya venció.", storeName }));
    }
    const User = mongooseConnection.models.User;
    if (User && decoded.pref === "wishlist") {
      await User.updateOne({ _id: decoded.uid }, { $set: { "emailPreferences.wishlist": false } });
    }
    return res.status(200).type("html").send(
      unsubscribePage({ title: "Listo", message: "Ya no recibirás avisos de tus favoritos. Puedes volver a activarlos desde tu cuenta.", storeName })
    );
  });

  // ---- Admin (módulo wishlist) ----
  router.use(verifyToken);
  const canManage = createModuleAuthorizer({ mongooseConnection, sendError }).authorizeModule("wishlist");

  router.get("/settings", canManage, async (req, res) => {
    try {
      return res.status(200).json(await getSettings(mongooseConnection));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar los ajustes.");
    }
  });

  router.put("/settings", canManage, async (req, res) => {
    try {
      if (typeof req.body?.enabled !== "boolean") return sendError(res, 400, "VALIDATION_ERROR", "enabled debe ser true o false.");
      await Settings.updateOne({ singletonKey: "default" }, { $set: { enabled: req.body.enabled } }, { upsert: true });
      return res.status(200).json({ message: "Ajustes guardados.", settings: await getSettings(mongooseConnection) });
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al guardar los ajustes.");
    }
  });

  // Avisos de 30 días, los 20 más recientes y los productos más guardados en
  // favoritos (top 20, con existencias y si hoy se pueden comprar).
  router.get("/stats", canManage, async (req, res) => {
    try {
      const User = mongooseConnection.models.User;
      const Product = mongooseConnection.models.Product;
      const Inventory = mongooseConnection.models.Inventory;
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sentFilter = { sentAt: { $gte: since }, skipped: "" };
      const [sent, customers, recent, top, totals] = await Promise.all([
        Notice.countDocuments(sentFilter),
        Notice.distinct("customer", sentFilter),
        Notice.find({ sentAt: { $ne: null }, skipped: "" })
          .sort({ sentAt: -1 })
          .limit(20)
          .populate("customer", "name email")
          .populate("product", "name")
          .lean(),
        User
          ? User.aggregate([
              { $match: { role: "customer", "favorites.0": { $exists: true } } },
              { $unwind: "$favorites" },
              { $group: { _id: "$favorites", count: { $sum: 1 } } },
              { $sort: { count: -1, _id: 1 } },
              { $limit: 20 },
            ])
          : [],
        User
          ? User.aggregate([
              { $match: { role: "customer", "favorites.0": { $exists: true } } },
              { $group: { _id: null, customers: { $sum: 1 }, favorites: { $sum: { $size: "$favorites" } } } },
            ])
          : [],
      ]);
      const ids = top.map((t) => t._id);
      const [products, stock, available] = await Promise.all([
        Product ? Product.find({ _id: { $in: ids } }).select("name images isActive").lean() : [],
        Inventory ? Inventory.aggregate([{ $match: { product: { $in: ids } } }, { $group: { _id: "$product", quantity: { $sum: "$quantity" } } }]) : [],
        availableProducts(ids),
      ]);
      const productBy = new Map(products.map((p) => [String(p._id), p]));
      const stockBy = new Map(stock.map((s) => [String(s._id), s.quantity]));
      const availableIds = new Set(available.map((p) => String(p._id)));
      return res.status(200).json({
        last30Days: { sent, customers: customers.length },
        favorites: { customers: totals[0]?.customers || 0, total: totals[0]?.favorites || 0 },
        recent: recent.map((n) => ({
          _id: n._id,
          customer: n.customer ? { name: n.customer.name, email: n.customer.email } : null,
          product: n.product ? { _id: n.product._id, name: n.product.name } : null,
          sentAt: n.sentAt,
        })),
        topProducts: top
          .filter((t) => productBy.has(String(t._id)))
          .map((t) => {
            const p = productBy.get(String(t._id));
            return {
              product: { _id: p._id, name: p.name, image: p.images?.[0] || "", isActive: p.isActive !== false },
              favorites: t.count,
              stock: stockBy.get(String(t._id)) || 0,
              available: availableIds.has(String(t._id)),
            };
          }),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar las cifras.");
    }
  });

  // ---- Tarea programada ----
  const sendNotice = async (notice) => {
    const User = mongooseConnection.models.User;
    const skip = (reason) => Notice.updateOne({ _id: notice._id }, { $set: { skipped: reason } });
    const user = User ? await User.findById(notice.customer).select("name email role isVerified emailPreferences favorites").lean() : null;
    if (!user || user.role !== "customer" || !user.isVerified) return skip("customer");
    if (user.emailPreferences?.wishlist === false) return skip("unsubscribed");
    if (!(user.favorites || []).some((id) => String(id) === String(notice.product))) return skip("not_favorite");
    const [product] = await availableProducts([notice.product]);
    if (!product) return skip("out_of_stock");

    const config = await storeConfigOf();
    const backend = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");
    const frontend = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
    const image = product.images?.[0] || "";
    const { subject, html, text } = wishlistBackInStockEmailTemplate({
      branding: {
        storeName: config?.storeName || "Duck-Hack",
        logoUrl: backend && config?.logoUrl ? `${backend}/${String(config.logoUrl).replace(/^\/+/, "")}` : undefined,
        accent: config?.theme?.accentColor,
      },
      name: user.name,
      product: {
        name: product.name,
        price: product.priceRange ? product.priceRange.min : Number(product.price),
        fromPrice: Boolean(product.priceRange && product.priceRange.min !== product.priceRange.max),
        imageUrl: backend && image ? `${backend}/${String(image).replace(/^\/+/, "")}` : "",
      },
      productUrl: frontend ? `${frontend}${PRODUCT_PAGE_PATH}/${product._id}` : null,
      unsubscribeUrl: backend
        ? `${backend}/api/wishlist/unsubscribe?token=${encodeURIComponent(signEmailPreferencesToken({ userId: user._id, preference: "wishlist" }))}`
        : null,
    });
    await notify({ channel: "email", to: user.email, subject, html, text });
    return undefined;
  };

  const runWishlist = async ({ now = new Date() } = {}) => {
    if (!(await isModuleContracted(mongooseConnection, "wishlist"))) return { skipped: "not_contracted" };
    if (!(await getSettings(mongooseConnection)).enabled) return { skipped: "disabled" };
    const User = mongooseConnection.models.User;
    if (!User) return { skipped: "no_users" };

    // 1) Estado actual de los productos en favoritos → transiciones.
    const ids = await User.distinct("favorites", { role: "customer" });
    const availableIds = new Set((await availableProducts(ids)).map((p) => String(p._id)));
    const states = new Map((await StockState.find({ product: { $in: ids } }).lean()).map((s) => [String(s.product), s]));
    let restocked = 0;
    for (const id of ids) {
      const available = availableIds.has(String(id));
      const state = states.get(String(id));
      if (!state) {
        // Primera vez: solo se registra.
        await StockState.updateOne({ product: id }, { $setOnInsert: { available, changedAt: now } }, { upsert: true });
        continue;
      }
      if (state.available === available) continue;
      // Atómico: solo una corrida ve el cambio.
      const changed = await StockState.findOneAndUpdate(
        { _id: state._id, available: state.available },
        { $set: { available, changedAt: now } },
        { new: true }
      );
      if (!changed || !available) continue;
      restocked += 1;
      const fans = await User.find({
        role: "customer",
        isVerified: true,
        favorites: id,
        "emailPreferences.wishlist": { $ne: false },
      })
        .select("_id")
        .lean();
      if (fans.length) {
        await Notice.insertMany(
          fans.map((u) => ({ customer: u._id, product: id, restockAt: now })),
          { ordered: false }
        ).catch((error) => {
          if (error?.code !== 11000 && !error?.writeErrors) throw error;
        });
      }
    }

    // 2) Mandar los avisos pendientes (también los que fallaron antes).
    const sent = await claimEach({
      Model: Notice,
      filter: { createdAt: { $gte: new Date(+now - NOTICE_MAX_AGE_MS) } },
      markField: "sentAt",
      attemptsField: "attempts",
      sort: { createdAt: 1 },
      now,
      handle: sendNotice,
    });
    return { restocked, ...sent };
  };
  wishlistRunners.set(mongooseConnection, runWishlist);

  app.use("/api/wishlist", router);
}

// Tareas programadas (lib/scheduler.js): revisión cada 15 min.
function registerJobs(scheduler, ctx) {
  const run = wishlistRunners.get(ctx.mongooseConnection);
  if (run) scheduler.register("wishlist-back-in-stock", 15 * 60 * 1000, run);
}

module.exports = {
  name: "wishlist",
  registerRoutes,
  registerJobs,
  models: {
    WishlistSettings: wishlistSettingsSchema,
    ProductStockState: productStockStateSchema,
    WishlistNotice: wishlistNoticeSchema,
  },
};
