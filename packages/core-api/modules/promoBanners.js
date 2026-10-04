// Banner de promociones (`/api/promo-banners`, clave de permisos
// `promoBanner`). Fase 4.4 del Roadmap de cotizaciones (Obsidian "Fase 4 -
// Fidelizacion"). Campañas con imagen (y una opcional para celular), texto y
// botón, programadas por fechas, que el storefront pinta en el inicio y/o en
// la tienda (`placement`).
//
// Destino del botón (`target`): ninguno, una categoría de productos, un
// cupón o una URL. El público recibe el destino ya resuelto (slug de la
// categoría, código del cupón con su descuento). Un banner cuyo destino ya no
// sirve (categoría borrada u oculta; cupón apagado, vencido, agotado o todavía no
// vigente) no se muestra, aunque esté activo y en fechas: así nunca se
// anuncia un cupón que el checkout va a rechazar. El admin lo ve marcado.
const express = require("express");
const mongoose = require("mongoose");
const { sanitizeDoc, asTrimmedString, asFiniteNumber, isValidObjectId, getOrCreateModel, handleMongooseError } = require("../lib/moduleHelpers");
const { createModuleAuthorizer } = require("../lib/permissions");
const { normalizeCode } = require("../lib/coupons");

const TARGET_TYPES = ["none", "category", "coupon", "url"];
const PLACEMENTS = ["home", "shop", "all"];
const MAX_PATH = 300;

const promoBannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    text: { type: String, trim: true, maxlength: 300, default: "" },
    // Rutas de la biblioteca de medios (uploads/...).
    image: { type: String, required: true, trim: true, maxlength: MAX_PATH },
    mobileImage: { type: String, trim: true, maxlength: MAX_PATH, default: "" },
    buttonLabel: { type: String, trim: true, maxlength: 40, default: "" },
    target: {
      type: { type: String, enum: TARGET_TYPES, default: "none" },
      // category: id de la categoría; coupon: código; url: la URL.
      value: { type: String, trim: true, maxlength: MAX_PATH, default: "" },
    },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, min: 0, default: 0 },
    placement: { type: String, enum: PLACEMENTS, default: "home" },
  },
  { timestamps: true }
);
promoBannerSchema.index({ isActive: 1, placement: 1, sortOrder: 1 });

const couponLabel = (coupon) => {
  if (coupon.type === "percent") return `${coupon.value}% de descuento`;
  if (coupon.type === "free_shipping") return "Envío gratis";
  return `$${Number(coupon.value).toLocaleString("es-MX")} de descuento`;
};

// ¿Se puede anunciar este cupón hoy? (mismas reglas generales que
// lib/coupons.js#resolveCoupon, sin las que dependen del pedido). Los
// personales (carrito abandonado) nunca.
const couponProblem = (coupon, now) => {
  if (!coupon) return "El cupón ya no existe.";
  if (coupon.customerEmail) return "Es un cupón personal.";
  if (coupon.isActive === false) return "El cupón está desactivado.";
  if (coupon.startsAt && now < new Date(coupon.startsAt)) return "El cupón todavía no está vigente.";
  if (coupon.endsAt && now > new Date(coupon.endsAt)) return "El cupón ya venció.";
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return "El cupón ya se agotó.";
  return null;
};

// Programado / Activo / Vencido / Apagado (sin contar el destino).
const scheduleStatus = (banner, now = new Date()) => {
  if (banner.isActive === false) return "off";
  if (banner.endsAt && now > new Date(banner.endsAt)) return "expired";
  if (banner.startsAt && now < new Date(banner.startsAt)) return "scheduled";
  return "active";
};

const validatePayload = (sendError, { partial }) => (req, res, next) => {
  const payload = req.body || {};
  const out = {};
  const text = (field, max, { required } = {}) => {
    if (payload[field] === undefined) {
      if (required && !partial) return `${field} es requerido.`;
      return null;
    }
    const value = asTrimmedString(payload[field]);
    if (required && !value) return `${field} es requerido.`;
    if (value.length > max) return `${field} admite hasta ${max} caracteres.`;
    out[field] = value;
    return null;
  };
  const error =
    text("title", 120, { required: true }) ||
    text("text", 300) ||
    text("image", MAX_PATH, { required: true }) ||
    text("mobileImage", MAX_PATH) ||
    text("buttonLabel", 40);
  if (error) return sendError(res, 400, "VALIDATION_ERROR", error);

  if (payload.target !== undefined) {
    const type = payload.target?.type || "none";
    if (!TARGET_TYPES.includes(type)) return sendError(res, 400, "VALIDATION_ERROR", `target.type debe ser ${TARGET_TYPES.join(", ")}.`);
    let value = asTrimmedString(payload.target?.value);
    if (type === "none") value = "";
    if (type === "category" && !isValidObjectId(value)) return sendError(res, 400, "VALIDATION_ERROR", "Elige una categoría.");
    if (type === "coupon") {
      value = normalizeCode(value);
      if (!value) return sendError(res, 400, "VALIDATION_ERROR", "Elige un cupón.");
    }
    if (type === "url" && !(/^https?:\/\/\S+$/i.test(value) || /^\/\S*$/.test(value))) {
      return sendError(res, 400, "VALIDATION_ERROR", "La URL debe empezar con https:// (o con / para una página del sitio).");
    }
    if (value.length > MAX_PATH) return sendError(res, 400, "VALIDATION_ERROR", "target.value es demasiado largo.");
    out.target = { type, value };
  }
  for (const field of ["startsAt", "endsAt"]) {
    if (payload[field] === undefined) continue;
    if (payload[field] === null || payload[field] === "") {
      out[field] = null;
      continue;
    }
    const date = new Date(payload[field]);
    if (Number.isNaN(date.getTime())) return sendError(res, 400, "VALIDATION_ERROR", `${field} no es una fecha válida.`);
    out[field] = date;
  }
  if (payload.isActive !== undefined) out.isActive = Boolean(payload.isActive);
  if (payload.sortOrder !== undefined) {
    const sortOrder = asFiniteNumber(payload.sortOrder);
    if (sortOrder === null || !Number.isInteger(sortOrder) || sortOrder < 0) return sendError(res, 400, "VALIDATION_ERROR", "sortOrder debe ser un entero >= 0.");
    out.sortOrder = sortOrder;
  }
  if (payload.placement !== undefined) {
    if (!PLACEMENTS.includes(payload.placement)) return sendError(res, 400, "VALIDATION_ERROR", `placement debe ser ${PLACEMENTS.join(", ")}.`);
    out.placement = payload.placement;
  }
  req.body = out;
  return next();
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, sendError } = ctx;
  const PromoBanner = getOrCreateModel(mongooseConnection, "PromoBanner", promoBannerSchema);
  const router = express.Router();

  // Destinos ya resueltos de una lista de banners → Map(id → { target } | { problem }).
  const resolveTargets = async (banners, now = new Date()) => {
    const { Category, Coupon } = mongooseConnection.models;
    const categoryIds = banners.filter((b) => b.target?.type === "category").map((b) => b.target.value);
    const codes = banners.filter((b) => b.target?.type === "coupon").map((b) => b.target.value);
    const [categories, coupons] = await Promise.all([
      categoryIds.length && Category ? Category.find({ _id: { $in: categoryIds }, kind: "product" }).select("name slug isActive").lean() : [],
      codes.length && Coupon ? Coupon.find({ code: { $in: codes } }).lean() : [],
    ]);
    const categoryBy = new Map(categories.map((c) => [String(c._id), c]));
    const couponBy = new Map(coupons.map((c) => [c.code, c]));
    const out = new Map();
    for (const banner of banners) {
      const { type = "none", value = "" } = banner.target || {};
      let resolved;
      if (type === "category") {
        const category = categoryBy.get(String(value));
        if (!category) resolved = { problem: "La categoría ya no existe." };
        else if (category.isActive === false) resolved = { problem: "La categoría está oculta." };
        else resolved = { target: { type, categoryId: category._id, slug: category.slug, name: category.name } };
      } else if (type === "coupon") {
        const coupon = couponBy.get(value);
        const problem = couponProblem(coupon, now);
        resolved = problem
          ? { problem }
          : {
              target: {
                type,
                code: coupon.code,
                label: couponLabel(coupon),
                minPurchase: coupon.minPurchase || null,
                endsAt: coupon.endsAt || null,
              },
            };
      } else if (type === "url") {
        resolved = { target: { type, url: value } };
      } else {
        resolved = { target: { type: "none" } };
      }
      out.set(String(banner._id), resolved);
    }
    return out;
  };

  // ---- público ----
  // GET /public?placement=home|shop — activos, en fechas y con destino
  // vigente, en orden. Los de placement "all" salen en los dos.
  router.get("/public", async (req, res) => {
    try {
      const now = new Date();
      const filter = {
        isActive: true,
        $and: [
          { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
          { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
        ],
      };
      if (req.query.placement !== undefined) {
        if (!["home", "shop"].includes(req.query.placement)) return sendError(res, 400, "VALIDATION_ERROR", "placement debe ser home o shop.");
        filter.placement = { $in: [req.query.placement, "all"] };
      }
      const banners = await PromoBanner.find(filter).sort({ sortOrder: 1, createdAt: -1 }).limit(20).lean();
      const targets = await resolveTargets(banners, now);
      return res.status(200).json({
        items: banners
          .filter((b) => targets.get(String(b._id)).target)
          .map((b) => ({
            _id: b._id,
            title: b.title,
            text: b.text,
            image: b.image,
            mobileImage: b.mobileImage || "",
            buttonLabel: targets.get(String(b._id)).target.type === "none" ? "" : b.buttonLabel,
            placement: b.placement,
            endsAt: b.endsAt,
            target: targets.get(String(b._id)).target,
          })),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar los banners.");
    }
  });

  // ---- staff ----
  router.use(verifyToken);
  router.use(createModuleAuthorizer({ mongooseConnection, sendError }).authorizeModule("promoBanner"));

  const staffView = (banner, resolved, now) => ({
    ...sanitizeDoc(banner),
    status: scheduleStatus(banner, now),
    // El destino ya no sirve: el banner no se muestra aunque esté activo.
    targetProblem: resolved?.problem || null,
    targetSummary: resolved?.target || null,
  });

  // Destinos que se pueden elegir en el formulario (sin pedir los permisos de
  // Productos o Cupones): categorías de productos y cupones que hoy se pueden
  // anunciar (los no vigentes todavía también, para programar campañas).
  router.get("/options", async (req, res) => {
    try {
      const { Category, Coupon } = mongooseConnection.models;
      const now = new Date();
      const [categories, coupons] = await Promise.all([
        Category ? Category.find({ kind: "product", isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1 }).select("name slug").lean() : [],
        Coupon
          ? Coupon.find({ customerEmail: { $in: ["", null] }, isActive: { $ne: false }, $or: [{ endsAt: null }, { endsAt: { $gte: now } }] })
              .sort({ code: 1 })
              .lean()
          : [],
      ]);
      return res.status(200).json({
        categories: categories.map((c) => ({ _id: c._id, name: c.name, slug: c.slug })),
        coupons: coupons
          .filter((c) => !(c.maxUses && c.usedCount >= c.maxUses))
          .map((c) => ({ code: c.code, label: couponLabel(c), startsAt: c.startsAt, endsAt: c.endsAt })),
      });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar los destinos.");
    }
  });

  router.get("/", async (req, res) => {
    try {
      const now = new Date();
      const banners = await PromoBanner.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
      const targets = await resolveTargets(banners, now);
      return res.status(200).json({ items: banners.map((b) => staffView(b, targets.get(String(b._id)), now)) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar los banners.");
    }
  });

  const ensureBanner = async (req, res, next) => {
    if (!isValidObjectId(req.params.id)) return sendError(res, 400, "INVALID_OBJECT_ID", "id no válido");
    const banner = await PromoBanner.findById(req.params.id).catch(() => null);
    if (!banner) return sendError(res, 404, "PROMO_BANNER_NOT_FOUND", "Banner no encontrado.");
    req.banner = banner;
    return next();
  };

  // Reglas sobre el banner ya combinado: fechas en orden y destino que exista
  // al guardar (un cupón que después vence solo deja de mostrarse).
  const checkCombined = async (banner) => {
    if (banner.startsAt && banner.endsAt && new Date(banner.endsAt) <= new Date(banner.startsAt)) {
      return { status: 400, code: "VALIDATION_ERROR", message: "La fecha de fin debe ser posterior a la de inicio." };
    }
    const { type, value } = banner.target || {};
    if (type === "category") {
      const exists = await mongooseConnection.models.Category?.exists({ _id: value, kind: "product" });
      if (!exists) return { status: 400, code: "CATEGORY_NOT_FOUND", message: "Esa categoría no existe." };
    }
    if (type === "coupon") {
      const coupon = await mongooseConnection.models.Coupon?.findOne({ code: value }).lean();
      if (!coupon) return { status: 400, code: "COUPON_NOT_FOUND", message: "Ese cupón no existe." };
      if (coupon.customerEmail) return { status: 400, code: "COUPON_IS_PERSONAL", message: "Un cupón personal no se puede anunciar." };
    }
    return null;
  };

  const respondOne = async (res, status, banner, message) => {
    const doc = banner.toObject ? banner.toObject() : banner;
    const targets = await resolveTargets([doc]);
    return res.status(status).json({ message, banner: staffView(doc, targets.get(String(doc._id)), new Date()) });
  };

  router.get("/:id", ensureBanner, async (req, res) => {
    const doc = req.banner.toObject();
    const targets = await resolveTargets([doc]);
    return res.status(200).json(staffView(doc, targets.get(String(doc._id)), new Date()));
  });

  router.post("/", validatePayload(sendError, { partial: false }), async (req, res) => {
    try {
      const problem = await checkCombined({ target: { type: "none" }, ...req.body });
      if (problem) return sendError(res, problem.status, problem.code, problem.message);
      const banner = await PromoBanner.create(req.body);
      return respondOne(res, 201, banner, "Banner creado.");
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al crear el banner.");
    }
  });

  router.put("/:id", ensureBanner, validatePayload(sendError, { partial: true }), async (req, res) => {
    try {
      const { banner } = req;
      const merged = { ...banner.toObject(), ...req.body };
      const problem = await checkCombined(merged);
      if (problem) return sendError(res, problem.status, problem.code, problem.message);
      banner.set(req.body);
      await banner.save();
      return respondOne(res, 200, banner, "Banner actualizado.");
    } catch (error) {
      return handleMongooseError(sendError, res, error, "Error al actualizar el banner.");
    }
  });

  router.delete("/:id", ensureBanner, async (req, res) => {
    try {
      await req.banner.deleteOne();
      return res.status(200).json({ message: "Banner eliminado." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el banner.");
    }
  });

  app.use("/api/promo-banners", router);
}

module.exports = {
  name: "promoBanners",
  registerRoutes,
  models: { PromoBanner: promoBannerSchema },
};
