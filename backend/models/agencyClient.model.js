const mongoose = require("mongoose");

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
    hostingProvider: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    serverLocation: {
      type: String,
      trim: true,
      maxlength: 200,
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
