// Gancho compartido: cuando un cliente paga (hosting o un abono a deuda de
// diseño), esto genera automáticamente el ingreso en contabilidad y la
// factura correspondiente. Se usa desde agencyClient.routes.js — nunca desde
// una ruta propia, para no exponer una forma de "inyectar" ingresos falsos
// que parezcan venir de un pago real.
const Transaction = require("../models/transaction.model");
const Invoice = require("../models/invoice.model");

const getNextInvoiceFolio = async () => {
  const last = await Invoice.findOne().sort({ folio: -1 }).select("folio").lean();
  return (last?.folio || 0) + 1;
};

/**
 * Crea la transacción de ingreso + la factura automática de un pago de
 * cliente. No lanza: si algo falla aquí, el pago en sí ya se guardó
 * correctamente y no debe perderse por un error secundario de contabilidad;
 * solo se deja constancia en el log del servidor.
 */
const recordIncomeAndInvoice = async ({ client, amount, date, category, description, concept, sourceCollection, sourceId }) => {
  if (!(amount > 0)) return null; // sin monto, no hay nada que registrar

  try {
    const source = sourceCollection === "HostingPayment" ? "hosting_payment" : "design_debt";

    await Transaction.create({
      type: "income",
      amount,
      date,
      category,
      description,
      client: client._id,
      source,
      sourceCollection,
      sourceId,
    });

    const folio = await getNextInvoiceFolio();
    const invoice = await Invoice.create({
      client: client._id,
      folio,
      concept,
      amount,
      issuedAt: date,
      source,
      sourceCollection,
      sourceId,
    });
    return invoice;
  } catch (error) {
    console.error("Error generando transacción/factura automática:", error);
    return null;
  }
};

module.exports = { recordIncomeAndInvoice, getNextInvoiceFolio };
