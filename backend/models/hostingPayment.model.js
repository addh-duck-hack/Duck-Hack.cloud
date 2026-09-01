const mongoose = require("mongoose");

// Historial de pagos de hosting de un cliente de agencia (ver agencyClient.model.js).
const hostingPaymentSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AgencyClient",
      required: true,
    },
    paidAt: {
      type: Date,
      required: true,
    },
    // Fecha hasta la que queda cubierto el hosting con este pago.
    coversUntil: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

// Permite obtener rápido el último pago vigente de un cliente (coversUntil desc).
hostingPaymentSchema.index({ client: 1, coversUntil: -1 });

const HostingPayment = mongoose.model("HostingPayment", hostingPaymentSchema);

module.exports = HostingPayment;
