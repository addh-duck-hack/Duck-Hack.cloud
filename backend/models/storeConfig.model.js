const mongoose = require("mongoose");

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

const isValidHexColor = (value) => !value || HEX_COLOR_REGEX.test(value);

const homeBlockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["hero", "featured_products", "banners", "rich_text"],
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
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
    // "manual": value se edita a mano desde el admin (ej. Disponibilidad, Garantía).
    // "active_clients"/"active_containers": value se recalcula en cada GET /public
    // (ver storeConfig.routes.js) a partir de datos reales — el value guardado en
    // Mongo para estos casos es solo un placeholder, no se le hace caso al leerlo.
    source: {
      type: String,
      enum: ["manual", "active_clients", "active_containers"],
      default: "manual",
    },
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
    primaryColor: {
      type: String,
      trim: true,
      validate: {
        validator: isValidHexColor,
        message: "primaryColor debe ser un color HEX válido.",
      },
    },
    secondaryColor: {
      type: String,
      trim: true,
      validate: {
        validator: isValidHexColor,
        message: "secondaryColor debe ser un color HEX válido.",
      },
    },
    accentColor: {
      type: String,
      trim: true,
      validate: {
        validator: isValidHexColor,
        message: "accentColor debe ser un color HEX válido.",
      },
    },
    fontFamilyHeading: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    fontFamilyBody: {
      type: String,
      trim: true,
      maxlength: 80,
    },
  },
  { _id: false }
);

const storeConfigSchema = new mongoose.Schema(
  {
    // Garantiza configuración única por instancia (single-tenant por despliegue).
    singletonKey: {
      type: String,
      default: "default",
      immutable: true,
      unique: true,
      index: true,
    },
    storeName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    storeSlug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 80,
      match: [/^[a-z0-9-]+$/, "storeSlug solo permite minúsculas, números y guiones."],
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 160,
    },
    contactPhone: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    logoUrl: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    theme: {
      type: storeThemeSchema,
      default: () => ({}),
    },
    homeBlocks: {
      type: [homeBlockSchema],
      default: [],
    },
    socialLinks: {
      type: socialLinksSchema,
      default: () => ({}),
    },
    legalIdentity: {
      type: legalIdentitySchema,
      default: () => ({}),
    },
    heroSlides: {
      type: [heroSlideSchema],
      default: [],
    },
    metrics: {
      type: [metricSchema],
      default: [],
    },
    commands: {
      type: [commandSchema],
      default: [],
    },
    services: {
      type: [serviceItemSchema],
      default: [],
    },
    pricingPlans: {
      type: [pricingPlanSchema],
      default: [],
    },
    commonPlanChecks: {
      type: [String],
      default: [],
    },
    faqs: {
      type: [faqSchema],
      default: [],
    },
    teamMembers: {
      type: [teamMemberSchema],
      default: [],
    },
    testimonials: {
      type: [testimonialSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

storeConfigSchema.index({ storeSlug: 1 }, { unique: true });

const StoreConfig = mongoose.model("StoreConfig", storeConfigSchema);

module.exports = StoreConfig;
