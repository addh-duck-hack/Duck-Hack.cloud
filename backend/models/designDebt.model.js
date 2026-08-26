const mongoose = require("mongoose");

// Historial de deudas/facturas por trabajos de diseño de un cliente de agencia
// (ver agencyClient.model.js). "status" se recalcula siempre server-side a partir
// de amount/amountPaid en backend/routes/agencyClient.routes.js — nunca se acepta
// directamente del cliente HTTP.
const designDebtSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AgencyClient",
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "partial", "paid"],
      default: "pending",
    },
    invoicedAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

designDebtSchema.index({ client: 1, status: 1 });

const DesignDebt = mongoose.model("DesignDebt", designDebtSchema);

module.exports = DesignDebt;
