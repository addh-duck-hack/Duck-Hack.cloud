const mongoose = require("mongoose");

// Comprobante de pago en PDF sin validez fiscal (no es CFDI). El PDF no se
// persiste en disco — se genera al vuelo en GET /api/invoices/:id/pdf a
// partir de este registro + los datos del cliente + los datos fijos del
// negocio (backend/utils/businessInfo.js). Confidencial: solo super_admin.
const invoiceSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AgencyClient",
      required: true,
    },
    // Folio consecutivo simple (no fiscal) — se asigna en la ruta buscando
    // el máximo actual + 1. Sin concurrencia real esperada (panel de un solo
    // administrador), no se justifica una colección de contador aparte.
    folio: {
      type: Number,
      required: true,
      unique: true,
    },
    concept: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    issuedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    source: {
      type: String,
      enum: ["manual", "hosting_payment", "design_debt"],
      default: "manual",
    },
    sourceCollection: {
      type: String,
      enum: ["HostingPayment", "DesignDebt"],
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
  },
  { timestamps: true }
);

invoiceSchema.index({ client: 1, issuedAt: -1 });

const Invoice = mongoose.model("Invoice", invoiceSchema);

module.exports = Invoice;
