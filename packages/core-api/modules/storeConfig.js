// StoreConfig. Copia fiel de backend/models/storeConfig.model.js +
// backend/routes/storeConfig.routes.js (ambos ahora eliminados) — mismo
// modelo (mismo nombre "StoreConfig" → misma colección Mongo `storeconfigs`,
// sin migración de datos), mismos 4 endpoints bajo /api/store-config.
//
// Única diferencia real: GET /public recalculaba métricas en vivo llamando
// directo a AgencyClient/Portainer — ambos deliberadamente fuera de
// core-api (herramienta interna de Duck-Hack, ver README.md). Se generaliza
// a un hook opcional `ctx.resolveLiveMetricSources` (mapa
// `{ [source]: async () => valor }`) que backend/server.js sigue
// alimentando con AgencyClient/Portainer — si una tienda futura no lo
// provee, esas métricas simplemente conservan su último valor guardado en
// vez de romper /public.
const express = require("express");
const mongoose = require("mongoose");
const {
  sanitizeDoc,
  handleMongooseError,
  asTrimmedString,
  asFiniteNumber,
  getOrCreateModel,
} = require("../lib/moduleHelpers");
const { createSingleImageUploadMiddlewares } = require("../lib/uploads");

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;
const SLUG_REGEX = /^[a-z0-9-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidHexColor = (value) => !value || HEX_COLOR_REGEX.test(value);
const validateEmail = (email) => EMAIL_REGEX.test(asTrimmedString(email));
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// --- Schema ---

const homeBlockSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: ["hero", "featured_products", "banners", "rich_text"], trim: true },
    title: { type: String, trim: true, maxlength: 120 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0, min: 0 },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const socialLinksSchema = new mongoose.Schema(
  {
    whatsapp: { type: String, trim: true, maxlength: 300 },
    instagram: { type: String, trim: true, maxlength: 300 },
    facebook: { type: String, trim: true, maxlength: 300 },
    threads: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false }
);

const legalIdentitySchema = new mongoose.Schema(
  {
    legalName: { type: String, trim: true, maxlength: 160 },
    rfc: { type: String, trim: true, maxlength: 20 },
    legalRepresentative: { type: String, trim: true, maxlength: 160 },
    legalAddress: { type: String, trim: true, maxlength: 400 },
    legalEmail: { type: String, trim: true, lowercase: true, maxlength: 160 },
    legalPhone: { type: String, trim: true, maxlength: 30 },
  },
  { _id: false }
);

const heroSlideSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 300 },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const metricSchema = new mongoose.Schema(
  {
    // "manual": value se edita a mano desde el admin. "active_clients"/
    // "active_containers": value se recalcula en cada GET /public vía
    // ctx.resolveLiveMetricSources — el value guardado en Mongo para estos
    // casos es solo un placeholder, no se le hace caso al leerlo.
    source: { type: String, enum: ["manual", "active_clients", "active_containers"], default: "manual" },
    value: { type: String, trim: true, maxlength: 20 },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    sortOrder: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const commandSchema = new mongoose.Schema(
  {
    cmd: { type: String, required: true, trim: true, maxlength: 80 },
    note: { type: String, trim: true, maxlength: 160 },
    icon: { type: String, trim: true, maxlength: 60 },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const serviceItemSchema = new mongoose.Schema(
  {
    icon: { type: String, trim: true, maxlength: 60 },
    route: { type: String, trim: true, maxlength: 120 },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const pricingPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300 },
    storage: { type: String, trim: true, maxlength: 40 },
    emailAccounts: { type: String, trim: true, maxlength: 40 },
    bandwidth: { type: String, trim: true, maxlength: 40 },
    ssl: { type: String, trim: true, maxlength: 60 },
    originalPrice: { type: Number, min: 0, default: null },
    price: { type: Number, min: 0, default: null },
    discountPercent: { type: Number, min: 0, max: 100, default: null },
    featured: { type: Boolean, default: false },
    extraFeaturesTitle: { type: String, trim: true, maxlength: 120 },
    extraFeatures: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const faqSchema = new mongoose.Schema(
  {
    q: { type: String, required: true, trim: true, maxlength: 200 },
    a: { type: String, required: true, trim: true, maxlength: 1000 },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const teamMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    role: { type: String, trim: true, maxlength: 160 },
    bio: { type: String, trim: true, maxlength: 500 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 30 },
    photoUrl: { type: String, trim: true, maxlength: 300 },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const testimonialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    rubro: { type: String, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500 },
    url: { type: String, trim: true, maxlength: 300 },
    photoUrl: { type: String, trim: true, maxlength: 300 },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const storeThemeSchema = new mongoose.Schema(
  {
    primaryColor: { type: String, trim: true, validate: { validator: isValidHexColor, message: "primaryColor debe ser un color HEX válido." } },
    secondaryColor: { type: String, trim: true, validate: { validator: isValidHexColor, message: "secondaryColor debe ser un color HEX válido." } },
    accentColor: { type: String, trim: true, validate: { validator: isValidHexColor, message: "accentColor debe ser un color HEX válido." } },
    fontFamilyHeading: { type: String, trim: true, maxlength: 80 },
    fontFamilyBody: { type: String, trim: true, maxlength: 80 },
  },
  { _id: false }
);

const storeConfigSchema = new mongoose.Schema(
  {
    // Garantiza configuración única por instancia (single-tenant por despliegue).
    singletonKey: { type: String, default: "default", immutable: true, unique: true, index: true },
    storeName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    storeSlug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 80,
      match: [/^[a-z0-9-]+$/, "storeSlug solo permite minúsculas, números y guiones."],
    },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 160 },
    contactPhone: { type: String, trim: true, maxlength: 30 },
    logoUrl: { type: String, trim: true, maxlength: 300 },
    theme: { type: storeThemeSchema, default: () => ({}) },
    homeBlocks: { type: [homeBlockSchema], default: [] },
    socialLinks: { type: socialLinksSchema, default: () => ({}) },
    legalIdentity: { type: legalIdentitySchema, default: () => ({}) },
    heroSlides: { type: [heroSlideSchema], default: [] },
    metrics: { type: [metricSchema], default: [] },
    commands: { type: [commandSchema], default: [] },
    services: { type: [serviceItemSchema], default: [] },
    pricingPlans: { type: [pricingPlanSchema], default: [] },
    commonPlanChecks: { type: [String], default: [] },
    faqs: { type: [faqSchema], default: [] },
    teamMembers: { type: [teamMemberSchema], default: [] },
    testimonials: { type: [testimonialSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
storeConfigSchema.index({ storeSlug: 1 }, { unique: true });

// --- Validación (portada de backend/middleware/validationMiddleware.js) ---

const validateStoreConfigArrayField = (payload, fieldName, itemValidator) => {
  if (payload[fieldName] === undefined) return null;
  if (!Array.isArray(payload[fieldName])) return `${fieldName} debe ser un arreglo.`;
  for (const [index, item] of payload[fieldName].entries()) {
    const error = itemValidator(item, index, fieldName);
    if (error) return error;
  }
  return null;
};

const validateStringListItem = (item, index, fieldName) => {
  if (typeof item !== "string") return `${fieldName}[${index}] debe ser texto.`;
  if (item.trim().length > 300) return `${fieldName}[${index}] excede 300 caracteres.`;
  return null;
};

const validateHeroSlideItem = (item, index) => {
  if (!isPlainObject(item)) return `heroSlides[${index}] debe ser un objeto.`;
  const title = asTrimmedString(item.title);
  if (!title || title.length > 160) return `heroSlides[${index}].title es requerido (máx. 160 caracteres).`;
  item.title = title;
  if (item.description !== undefined) {
    const description = asTrimmedString(item.description);
    if (description.length > 300) return `heroSlides[${index}].description excede 300 caracteres.`;
    item.description = description;
  }
  if (item.sortOrder !== undefined && (!Number.isInteger(item.sortOrder) || item.sortOrder < 0)) {
    return `heroSlides[${index}].sortOrder debe ser entero >= 0.`;
  }
  if (item.isActive !== undefined && typeof item.isActive !== "boolean") return `heroSlides[${index}].isActive debe ser boolean.`;
  return null;
};

const METRIC_SOURCES = new Set(["manual", "active_clients", "active_containers"]);

const validateMetricItem = (item, index) => {
  if (!isPlainObject(item)) return `metrics[${index}] debe ser un objeto.`;

  const source = item.source !== undefined ? asTrimmedString(item.source) : "manual";
  if (!METRIC_SOURCES.has(source)) return `metrics[${index}].source no es válido.`;
  item.source = source;

  const value = asTrimmedString(item.value);
  if (value.length > 20) return `metrics[${index}].value excede 20 caracteres.`;
  if (source === "manual" && !value) return `metrics[${index}].value es requerido cuando source es "manual".`;
  item.value = value;

  const label = asTrimmedString(item.label);
  if (!label || label.length > 80) return `metrics[${index}].label es requerido (máx. 80 caracteres).`;
  item.label = label;
  if (item.sortOrder !== undefined && (!Number.isInteger(item.sortOrder) || item.sortOrder < 0)) {
    return `metrics[${index}].sortOrder debe ser entero >= 0.`;
  }
  return null;
};

const validateCommandItem = (item, index) => {
  if (!isPlainObject(item)) return `commands[${index}] debe ser un objeto.`;
  const cmd = asTrimmedString(item.cmd);
  if (!cmd || cmd.length > 80) return `commands[${index}].cmd es requerido (máx. 80 caracteres).`;
  item.cmd = cmd;
  if (item.note !== undefined) {
    const note = asTrimmedString(item.note);
    if (note.length > 160) return `commands[${index}].note excede 160 caracteres.`;
    item.note = note;
  }
  if (item.icon !== undefined) {
    const icon = asTrimmedString(item.icon);
    if (icon.length > 60) return `commands[${index}].icon excede 60 caracteres.`;
    item.icon = icon;
  }
  if (item.sortOrder !== undefined && (!Number.isInteger(item.sortOrder) || item.sortOrder < 0)) {
    return `commands[${index}].sortOrder debe ser entero >= 0.`;
  }
  if (item.isActive !== undefined && typeof item.isActive !== "boolean") return `commands[${index}].isActive debe ser boolean.`;
  return null;
};

const validateServiceItem = (item, index) => {
  if (!isPlainObject(item)) return `services[${index}] debe ser un objeto.`;
  const title = asTrimmedString(item.title);
  if (!title || title.length > 100) return `services[${index}].title es requerido (máx. 100 caracteres).`;
  item.title = title;
  if (item.icon !== undefined) {
    const icon = asTrimmedString(item.icon);
    if (icon.length > 60) return `services[${index}].icon excede 60 caracteres.`;
    item.icon = icon;
  }
  if (item.route !== undefined) {
    const route = asTrimmedString(item.route);
    if (route.length > 120) return `services[${index}].route excede 120 caracteres.`;
    item.route = route;
  }
  if (item.description !== undefined) {
    const description = asTrimmedString(item.description);
    if (description.length > 500) return `services[${index}].description excede 500 caracteres.`;
    item.description = description;
  }
  if (item.sortOrder !== undefined && (!Number.isInteger(item.sortOrder) || item.sortOrder < 0)) {
    return `services[${index}].sortOrder debe ser entero >= 0.`;
  }
  if (item.isActive !== undefined && typeof item.isActive !== "boolean") return `services[${index}].isActive debe ser boolean.`;
  return null;
};

const validatePricingPlanItem = (item, index) => {
  if (!isPlainObject(item)) return `pricingPlans[${index}] debe ser un objeto.`;
  const name = asTrimmedString(item.name);
  if (!name || name.length > 60) return `pricingPlans[${index}].name es requerido (máx. 60 caracteres).`;
  item.name = name;
  for (const field of ["description", "storage", "emailAccounts", "bandwidth", "ssl", "extraFeaturesTitle"]) {
    if (item[field] !== undefined) {
      const value = asTrimmedString(item[field]);
      const max = field === "description" ? 300 : field === "extraFeaturesTitle" ? 120 : 40;
      if (value.length > max) return `pricingPlans[${index}].${field} excede ${max} caracteres.`;
      item[field] = value;
    }
  }
  for (const field of ["originalPrice", "price"]) {
    if (item[field] !== undefined && item[field] !== null) {
      const num = asFiniteNumber(item[field]);
      if (num === null || num < 0) return `pricingPlans[${index}].${field} debe ser un número >= 0.`;
      item[field] = num;
    }
  }
  if (item.discountPercent !== undefined && item.discountPercent !== null) {
    const num = asFiniteNumber(item.discountPercent);
    if (num === null || num < 0 || num > 100) return `pricingPlans[${index}].discountPercent debe ser un número entre 0 y 100.`;
    item.discountPercent = num;
  }
  if (item.featured !== undefined && typeof item.featured !== "boolean") return `pricingPlans[${index}].featured debe ser boolean.`;
  if (item.isActive !== undefined && typeof item.isActive !== "boolean") return `pricingPlans[${index}].isActive debe ser boolean.`;
  if (item.sortOrder !== undefined && (!Number.isInteger(item.sortOrder) || item.sortOrder < 0)) {
    return `pricingPlans[${index}].sortOrder debe ser entero >= 0.`;
  }
  if (item.extraFeatures !== undefined) {
    if (!Array.isArray(item.extraFeatures)) return `pricingPlans[${index}].extraFeatures debe ser un arreglo.`;
    for (const [i, feature] of item.extraFeatures.entries()) {
      if (typeof feature !== "string" || feature.trim().length > 200) {
        return `pricingPlans[${index}].extraFeatures[${i}] debe ser texto (máx. 200 caracteres).`;
      }
      item.extraFeatures[i] = feature.trim();
    }
  }
  return null;
};

const validateFaqItem = (item, index) => {
  if (!isPlainObject(item)) return `faqs[${index}] debe ser un objeto.`;
  const q = asTrimmedString(item.q);
  if (!q || q.length > 200) return `faqs[${index}].q es requerido (máx. 200 caracteres).`;
  item.q = q;
  const a = asTrimmedString(item.a);
  if (!a || a.length > 1000) return `faqs[${index}].a es requerido (máx. 1000 caracteres).`;
  item.a = a;
  if (item.sortOrder !== undefined && (!Number.isInteger(item.sortOrder) || item.sortOrder < 0)) {
    return `faqs[${index}].sortOrder debe ser entero >= 0.`;
  }
  if (item.isActive !== undefined && typeof item.isActive !== "boolean") return `faqs[${index}].isActive debe ser boolean.`;
  return null;
};

const validateTeamMemberItem = (item, index) => {
  if (!isPlainObject(item)) return `teamMembers[${index}] debe ser un objeto.`;
  const name = asTrimmedString(item.name);
  if (!name || name.length > 100) return `teamMembers[${index}].name es requerido (máx. 100 caracteres).`;
  item.name = name;
  if (item.role !== undefined) {
    const role = asTrimmedString(item.role);
    if (role.length > 160) return `teamMembers[${index}].role excede 160 caracteres.`;
    item.role = role;
  }
  if (item.bio !== undefined) {
    const bio = asTrimmedString(item.bio);
    if (bio.length > 500) return `teamMembers[${index}].bio excede 500 caracteres.`;
    item.bio = bio;
  }
  if (item.email !== undefined) {
    const email = asTrimmedString(item.email).toLowerCase();
    if (email && !validateEmail(email)) return `teamMembers[${index}].email no es válido.`;
    item.email = email;
  }
  if (item.phone !== undefined) {
    const phone = asTrimmedString(item.phone);
    if (phone.length > 30) return `teamMembers[${index}].phone excede 30 caracteres.`;
    item.phone = phone;
  }
  if (item.photoUrl !== undefined) {
    const photoUrl = asTrimmedString(item.photoUrl);
    if (photoUrl.length > 300) return `teamMembers[${index}].photoUrl excede 300 caracteres.`;
    item.photoUrl = photoUrl;
  }
  if (item.sortOrder !== undefined && (!Number.isInteger(item.sortOrder) || item.sortOrder < 0)) {
    return `teamMembers[${index}].sortOrder debe ser entero >= 0.`;
  }
  if (item.isActive !== undefined && typeof item.isActive !== "boolean") return `teamMembers[${index}].isActive debe ser boolean.`;
  return null;
};

const validateTestimonialItem = (item, index) => {
  if (!isPlainObject(item)) return `testimonials[${index}] debe ser un objeto.`;
  const name = asTrimmedString(item.name);
  if (!name || name.length > 120) return `testimonials[${index}].name es requerido (máx. 120 caracteres).`;
  item.name = name;
  if (item.rubro !== undefined) {
    const rubro = asTrimmedString(item.rubro);
    if (rubro.length > 120) return `testimonials[${index}].rubro excede 120 caracteres.`;
    item.rubro = rubro;
  }
  if (item.description !== undefined) {
    const description = asTrimmedString(item.description);
    if (description.length > 500) return `testimonials[${index}].description excede 500 caracteres.`;
    item.description = description;
  }
  if (item.url !== undefined) {
    const url = asTrimmedString(item.url);
    if (url.length > 300) return `testimonials[${index}].url excede 300 caracteres.`;
    item.url = url;
  }
  if (item.photoUrl !== undefined) {
    const photoUrl = asTrimmedString(item.photoUrl);
    if (photoUrl.length > 300) return `testimonials[${index}].photoUrl excede 300 caracteres.`;
    item.photoUrl = photoUrl;
  }
  if (item.sortOrder !== undefined && (!Number.isInteger(item.sortOrder) || item.sortOrder < 0)) {
    return `testimonials[${index}].sortOrder debe ser entero >= 0.`;
  }
  if (item.isActive !== undefined && typeof item.isActive !== "boolean") return `testimonials[${index}].isActive debe ser boolean.`;
  return null;
};

const validateStoreConfigPayload = (sendError) => (req, res, next) => {
  const payload = req.body || {};

  if (payload.storeName !== undefined) {
    const storeName = asTrimmedString(payload.storeName);
    if (!storeName || storeName.length < 2 || storeName.length > 120) {
      return sendError(res, 400, "VALIDATION_ERROR", "storeName debe tener entre 2 y 120 caracteres.");
    }
    req.body.storeName = storeName;
  }

  if (payload.storeSlug !== undefined) {
    const storeSlug = asTrimmedString(payload.storeSlug).toLowerCase();
    if (!storeSlug || storeSlug.length < 2 || storeSlug.length > 80 || !SLUG_REGEX.test(storeSlug)) {
      return sendError(res, 400, "VALIDATION_ERROR", "storeSlug solo permite minúsculas, números y guiones (2-80 chars).");
    }
    req.body.storeSlug = storeSlug;
  }

  if (payload.contactEmail !== undefined) {
    const contactEmail = asTrimmedString(payload.contactEmail).toLowerCase();
    if (contactEmail && !validateEmail(contactEmail)) {
      return sendError(res, 400, "VALIDATION_ERROR", "contactEmail no es válido.");
    }
    req.body.contactEmail = contactEmail;
  }

  if (payload.contactPhone !== undefined) {
    const contactPhone = asTrimmedString(payload.contactPhone);
    if (contactPhone.length > 30) return sendError(res, 400, "VALIDATION_ERROR", "contactPhone excede 30 caracteres.");
    req.body.contactPhone = contactPhone;
  }

  if (payload.logoUrl !== undefined) {
    const logoUrl = asTrimmedString(payload.logoUrl);
    if (logoUrl.length > 300) return sendError(res, 400, "VALIDATION_ERROR", "logoUrl excede 300 caracteres.");
    req.body.logoUrl = logoUrl;
  }

  if (payload.isActive !== undefined && typeof payload.isActive !== "boolean") {
    return sendError(res, 400, "VALIDATION_ERROR", "isActive debe ser boolean.");
  }

  if (payload.theme !== undefined) {
    if (typeof payload.theme !== "object" || payload.theme === null || Array.isArray(payload.theme)) {
      return sendError(res, 400, "VALIDATION_ERROR", "theme debe ser un objeto.");
    }
    const { primaryColor, secondaryColor, accentColor, fontFamilyHeading, fontFamilyBody } = payload.theme;
    for (const colorField of [primaryColor, secondaryColor, accentColor]) {
      if (colorField !== undefined) {
        const value = asTrimmedString(colorField);
        if (value && !HEX_COLOR_REGEX.test(value)) {
          return sendError(res, 400, "VALIDATION_ERROR", "Los colores del theme deben ser hex válidos.");
        }
      }
    }
    if (fontFamilyHeading !== undefined && asTrimmedString(fontFamilyHeading).length > 80) {
      return sendError(res, 400, "VALIDATION_ERROR", "fontFamilyHeading excede 80 caracteres.");
    }
    if (fontFamilyBody !== undefined && asTrimmedString(fontFamilyBody).length > 80) {
      return sendError(res, 400, "VALIDATION_ERROR", "fontFamilyBody excede 80 caracteres.");
    }
  }

  if (payload.homeBlocks !== undefined) {
    if (!Array.isArray(payload.homeBlocks)) return sendError(res, 400, "VALIDATION_ERROR", "homeBlocks debe ser un arreglo.");
    const allowedBlockTypes = new Set(["hero", "featured_products", "banners", "rich_text"]);
    for (const [index, block] of payload.homeBlocks.entries()) {
      if (!block || typeof block !== "object" || Array.isArray(block)) {
        return sendError(res, 400, "VALIDATION_ERROR", `homeBlocks[${index}] debe ser un objeto.`);
      }
      const type = asTrimmedString(block.type);
      if (!allowedBlockTypes.has(type)) return sendError(res, 400, "VALIDATION_ERROR", `homeBlocks[${index}].type no es válido.`);
      if (block.title !== undefined && asTrimmedString(block.title).length > 120) {
        return sendError(res, 400, "VALIDATION_ERROR", `homeBlocks[${index}].title excede 120 caracteres.`);
      }
      if (block.sortOrder !== undefined && (!Number.isInteger(block.sortOrder) || block.sortOrder < 0)) {
        return sendError(res, 400, "VALIDATION_ERROR", `homeBlocks[${index}].sortOrder debe ser entero >= 0.`);
      }
    }
  }

  if (payload.socialLinks !== undefined) {
    if (typeof payload.socialLinks !== "object" || payload.socialLinks === null || Array.isArray(payload.socialLinks)) {
      return sendError(res, 400, "VALIDATION_ERROR", "socialLinks debe ser un objeto.");
    }
    for (const key of ["whatsapp", "instagram", "facebook", "threads"]) {
      const value = payload.socialLinks[key];
      if (value !== undefined && asTrimmedString(value).length > 300) {
        return sendError(res, 400, "VALIDATION_ERROR", `socialLinks.${key} excede 300 caracteres.`);
      }
    }
  }

  if (payload.legalIdentity !== undefined) {
    if (typeof payload.legalIdentity !== "object" || payload.legalIdentity === null || Array.isArray(payload.legalIdentity)) {
      return sendError(res, 400, "VALIDATION_ERROR", "legalIdentity debe ser un objeto.");
    }
    const { legalName, rfc, legalRepresentative, legalAddress, legalEmail, legalPhone } = payload.legalIdentity;
    if (legalName !== undefined && asTrimmedString(legalName).length > 160) {
      return sendError(res, 400, "VALIDATION_ERROR", "legalIdentity.legalName excede 160 caracteres.");
    }
    if (rfc !== undefined && asTrimmedString(rfc).length > 20) {
      return sendError(res, 400, "VALIDATION_ERROR", "legalIdentity.rfc excede 20 caracteres.");
    }
    if (legalRepresentative !== undefined && asTrimmedString(legalRepresentative).length > 160) {
      return sendError(res, 400, "VALIDATION_ERROR", "legalIdentity.legalRepresentative excede 160 caracteres.");
    }
    if (legalAddress !== undefined && asTrimmedString(legalAddress).length > 400) {
      return sendError(res, 400, "VALIDATION_ERROR", "legalIdentity.legalAddress excede 400 caracteres.");
    }
    if (legalEmail !== undefined && asTrimmedString(legalEmail) && !validateEmail(legalEmail)) {
      return sendError(res, 400, "VALIDATION_ERROR", "legalIdentity.legalEmail no es válido.");
    }
    if (legalPhone !== undefined && asTrimmedString(legalPhone).length > 30) {
      return sendError(res, 400, "VALIDATION_ERROR", "legalIdentity.legalPhone excede 30 caracteres.");
    }
  }

  const arrayFieldError =
    validateStoreConfigArrayField(payload, "heroSlides", validateHeroSlideItem) ||
    validateStoreConfigArrayField(payload, "metrics", validateMetricItem) ||
    validateStoreConfigArrayField(payload, "commands", validateCommandItem) ||
    validateStoreConfigArrayField(payload, "services", validateServiceItem) ||
    validateStoreConfigArrayField(payload, "pricingPlans", validatePricingPlanItem) ||
    validateStoreConfigArrayField(payload, "commonPlanChecks", validateStringListItem) ||
    validateStoreConfigArrayField(payload, "faqs", validateFaqItem) ||
    validateStoreConfigArrayField(payload, "teamMembers", validateTeamMemberItem) ||
    validateStoreConfigArrayField(payload, "testimonials", validateTestimonialItem);
  if (arrayFieldError) {
    return sendError(res, 400, "VALIDATION_ERROR", arrayFieldError);
  }

  return next();
};

// Generaliza backend/routes/storeConfig.routes.js#resolveLiveMetrics: en vez
// de llamar directo a AgencyClient/Portainer, resuelve cada `source` no
// "manual" a través del mapa opcional resolveLiveMetricSources — nunca deja
// que un fallo acá tumbe /public (mejor mostrar el placeholder guardado que
// romper el storefront).
const resolveLiveMetrics = async (metrics, resolveLiveMetricSources = {}) => {
  if (!Array.isArray(metrics) || metrics.length === 0) return metrics;

  const neededSources = [...new Set(metrics.map((m) => m.source).filter((s) => s && s !== "manual"))];
  if (neededSources.length === 0) return metrics;

  const resolved = {};
  await Promise.allSettled(
    neededSources.map(async (source) => {
      const resolver = resolveLiveMetricSources[source];
      if (!resolver) return;
      resolved[source] = await resolver();
    })
  );

  return metrics.map((m) => {
    if (m.source !== "manual" && resolved[m.source] !== undefined && resolved[m.source] !== null) {
      return { ...m, value: String(resolved[m.source]) };
    }
    return m; // fuente automática pero no se pudo calcular (o no se proveyó
    // resolver para ella): se mantiene el placeholder guardado.
  });
};

function registerRoutes(app, ctx) {
  const { mongooseConnection, verifyToken, authorizeRoles, ROLES, sendError, resolveLiveMetricSources } = ctx;
  const StoreConfig = getOrCreateModel(mongooseConnection, "StoreConfig", storeConfigSchema);

  const router = express.Router();
  const canManage = authorizeRoles(ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN);

  router.get("/public", async (req, res) => {
    try {
      const config = await StoreConfig.findOne({ singletonKey: "default", isActive: true }).lean();
      if (!config) {
        return sendError(res, 404, "STORE_CONFIG_NOT_FOUND", "Configuración de tienda no encontrada.");
      }
      config.metrics = await resolveLiveMetrics(config.metrics, resolveLiveMetricSources);
      return res.status(200).json(sanitizeDoc(config));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar configuración de tienda.");
    }
  });

  router.get("/", verifyToken, canManage, async (req, res) => {
    try {
      const config = await StoreConfig.findOne({ singletonKey: "default" }).lean();
      if (!config) {
        return sendError(res, 404, "STORE_CONFIG_NOT_FOUND", "Configuración de tienda no encontrada.");
      }
      return res.status(200).json(sanitizeDoc(config));
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar configuración de tienda.");
    }
  });

  router.put("/", verifyToken, canManage, validateStoreConfigPayload(sendError), async (req, res) => {
    try {
      const allowedFields = [
        "storeName", "storeSlug", "contactEmail", "contactPhone", "logoUrl", "theme", "homeBlocks",
        "isActive", "socialLinks", "legalIdentity", "heroSlides", "metrics", "commands", "services",
        "pricingPlans", "commonPlanChecks", "faqs", "teamMembers", "testimonials",
      ];

      const updateData = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) updateData[key] = req.body[key];
      }

      if (Object.keys(updateData).length === 0) {
        return sendError(res, 400, "NO_UPDATE_FIELDS", "No se enviaron datos para actualizar.");
      }

      const updated = await StoreConfig.findOneAndUpdate(
        { singletonKey: "default" },
        { $set: updateData, $setOnInsert: { singletonKey: "default" } },
        { upsert: true, new: true, runValidators: true }
      );

      return res.status(200).json({
        message: "Configuración de tienda actualizada correctamente.",
        storeConfig: sanitizeDoc(updated),
      });
    } catch (error) {
      if (error?.code === 11000) {
        return sendError(res, 409, "STORE_CONFIG_DUPLICATE", "Conflicto de unicidad en configuración de tienda.");
      }
      return handleMongooseError(sendError, res, error, "Error al actualizar configuración de tienda.");
    }
  });

  const { uploadMiddleware: uploadStoreImage, sanitizeAndStoreMiddleware: sanitizeStoreImage } =
    createSingleImageUploadMiddlewares({
      fieldName: "image",
      filePrefix: "store-config",
      maxFileSizeMB: 5,
      sendError,
    });

  // Endpoint genérico de subida de imagen para store-config: sirve tanto
  // para el logo como para las fotos de equipo/testimonios. El frontend
  // decide a qué campo asigna el imagePath devuelto.
  router.post("/upload-image", verifyToken, canManage, uploadStoreImage, sanitizeStoreImage, (req, res) => {
    if (!req.savedImagePath) {
      return sendError(res, 400, "FILE_REQUIRED", "Se requiere un archivo en el campo image.");
    }
    return res.status(201).json({ message: "Imagen subida correctamente.", imagePath: req.savedImagePath });
  });

  app.use("/api/store-config", router);
}

module.exports = {
  name: "storeConfig",
  registerRoutes,
  models: { StoreConfig: storeConfigSchema },
};
