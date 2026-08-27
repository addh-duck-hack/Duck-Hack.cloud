const mongoose = require("mongoose");
const { HOSTING_PLAN_IDS } = require("../utils/hostingPlans");

// Registro de clientes de agencia (negocios externos que Duck-Hack administra),
// no confundir con el rol "customer" (compradores finales de una tienda).
// Info confidencial: solo debe usarse/poblarse desde la instancia interna de Duck-Hack.
const agencyClientSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    contactName: {
      type: String,
      trim: true,
      maxlength: 120,
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
    siteUrl: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    // Plan de hosting contratado (ver utils/hostingPlans.js) — de aquí sale
    // cuánto cobrarle al cliente cada mes.
    hostingPlan: {
      type: String,
      enum: HOSTING_PLAN_IDS,
    },
    // Para basic/medium/advanced se deriva y sobreescribe server-side del
    // precio de lista (utils/hostingPlans.js); solo "enterprise" lo captura
    // a mano, porque su precio es "bajo cotización" en el sitio público.
    hostingMonthlyCost: {
      type: Number,
      min: 0,
    },
    // Nombres exactos de contenedor en Portainer/Docker (un cliente puede tener
    // varios, ej. frontend + backend + base de datos propia).
    dockerContainers: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.every((name) => typeof name === "string" && name.length <= 200),
        message: "Cada nombre de contenedor debe ser texto de máximo 200 caracteres.",
      },
    },
    // Dominio donde está montado el sitio del cliente (no confundir con siteUrl,
    // que puede llevar protocolo/paths; este es solo el dominio, para tracking
    // de vencimiento de dominio).
    domain: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    // Para poder avisar al cliente antes de que el dominio caduque.
    domainExpiresAt: {
      type: Date,
    },
    // Datos de facturación del CLIENTE (para la sección "Facturar a" del PDF).
    // Todos opcionales — si no existen, la factura solo muestra businessName.
    billingName: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    billingRfc: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    billingAddress: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    billingEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 160,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

agencyClientSchema.index({ businessName: 1 });
agencyClientSchema.index({ isActive: 1 });

const AgencyClient = mongoose.model("AgencyClient", agencyClientSchema);

module.exports = AgencyClient;
