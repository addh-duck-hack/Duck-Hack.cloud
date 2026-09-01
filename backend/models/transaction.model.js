const mongoose = require("mongoose");

// Ledger de contabilidad interna de la agencia. El saldo actual es siempre
// sum(income) - sum(expense) sobre esta colección — el "saldo inicial" es en
// sí mismo una transacción (type: income, source: opening_balance), no un
// campo aparte, para no tener dos fuentes de verdad del saldo.
// Confidencial: mismo criterio que AgencyClient — solo super_admin.
const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["income", "expense"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    category: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AgencyClient",
    },
    // De dónde salió esta transacción — "manual" es la única editable/borrable
    // directamente; las demás se generan automáticamente y se corrigen desde
    // su origen (el pago de hosting o la deuda de diseño correspondiente).
    source: {
      type: String,
      enum: ["manual", "hosting_payment", "design_debt", "opening_balance"],
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

transactionSchema.index({ date: -1 });
transactionSchema.index({ type: 1, date: -1 });
transactionSchema.index({ client: 1 });

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
