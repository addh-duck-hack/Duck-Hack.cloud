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
    // "movements" = facturas creadas seleccionando uno o más Transaction ya
    // existentes (ver backend/routes/invoices.routes.js) — el flujo normal
    // desde este cambio en adelante. "manual"/"hosting_payment"/"design_debt"
    // se conservan como valores históricos de facturas emitidas antes.
    source: {
      type: String,
      enum: ["manual", "hosting_payment", "design_debt", "movements"],
      default: "manual",
    },
    sourceCollection: {
      type: String,
      enum: ["HostingPayment", "DesignDebt"],
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    // Movimientos (Transaction) que cubre esta factura. Vacío en facturas
    // manuales antiguas o legacy automáticas (source distinto de "movements").
    transactions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Transaction",
      },
    ],
    // Desglose por movimiento (concepto + monto individual) tal como estaban
    // al momento de facturar — es una copia (snapshot), no una referencia
    // viva a Transaction, para que el PDF no cambie si el movimiento de
    // origen se corrige después. `concept`/`amount` arriba siguen siendo el
    // resumen (título compuesto + total) que ya usan el listado y el PDF de
    // facturas antiguas sin `items` (manuales o legacy automáticas).
    items: [
      {
        _id: false,
        concept: { type: String, required: true, trim: true, maxlength: 300 },
        amount: { type: Number, required: true, min: 0.01 },
      },
    ],
  },
  { timestamps: true }
);

invoiceSchema.index({ client: 1, issuedAt: -1 });

const Invoice = mongoose.model("Invoice", invoiceSchema);

module.exports = Invoice;
