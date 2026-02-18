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
