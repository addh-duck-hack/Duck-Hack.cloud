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

/**
 * Contraparte de recordIncomeAndInvoice: cuando se elimina un pago de hosting
 * o una deuda de diseño desde la ficha del cliente, borra también la(s)
 * transacción(es) e factura(s) que se generaron automáticamente a partir de
 * ese registro (identificadas por sourceCollection+sourceId), para que el
 * saldo de contabilidad no quede con un ingreso "fantasma" de un pago que ya
 * no existe. Un DesignDebt puede tener varias transacciones ligadas (un abono
 * parcial por edición genera una transacción nueva cada vez), por eso se
 * borran todas las que coincidan, no solo una. Tampoco lanza, por la misma
 * razón que recordIncomeAndInvoice: el borrado del pago/deuda ya se hizo y no
 * debe fallar por un problema secundario de contabilidad.
 */
const deleteLinkedAccountingRecords = async ({ sourceCollection, sourceId }) => {
  try {
    await Promise.all([
      Transaction.deleteMany({ sourceCollection, sourceId }),
      Invoice.deleteMany({ sourceCollection, sourceId }),
    ]);
  } catch (error) {
    console.error("Error eliminando transacción/factura ligadas:", error);
  }
};

/**
 * Mantiene en sincronía el ingreso + factura de un registro que tiene, cuando
 * mucho, UNA transacción ligada (hosting payments: un pago = un ingreso).
 * NO usar con DesignDebt, donde varios abonos sucesivos generan varias
 * transacciones con el mismo sourceId a propósito (ver recordIncomeAndInvoice).
 *
 * Se llama al editar el pago, no solo al crearlo, para que un cambio de monto
 * (o de fecha, que afecta el mes mostrado en la factura) quede reflejado en
 * contabilidad en vez de dejar la transacción vieja con el monto original:
 *   - Si ya existía una transacción ligada: se actualiza en el mismo lugar
 *     (mismo folio de factura), en vez de crear un ingreso duplicado.
 *   - Si no existía y el nuevo monto es > 0 (el pago se creó sin monto y
 *     ahora se le puso uno): se crea, igual que en el alta.
 *   - Si el nuevo monto queda en 0/vacío: se borra la transacción y factura
 *     ligadas, si había.
 * Tampoco lanza, por la misma razón que el resto de este módulo.
 */
const syncSingleSourceIncome = async ({ client, amount, date, category, description, concept, sourceCollection, sourceId }) => {
  try {
    const existingTransaction = await Transaction.findOne({ sourceCollection, sourceId });

    if (!(amount > 0)) {
      if (existingTransaction) {
        await deleteLinkedAccountingRecords({ sourceCollection, sourceId });
      }
      return null;
    }

    if (!existingTransaction) {
      return recordIncomeAndInvoice({ client, amount, date, category, description, concept, sourceCollection, sourceId });
    }

    existingTransaction.amount = amount;
    existingTransaction.date = date;
    existingTransaction.category = category;
    existingTransaction.description = description;
    await existingTransaction.save();

    await Invoice.findOneAndUpdate({ sourceCollection, sourceId }, { amount, concept, issuedAt: date });

    return null;
  } catch (error) {
    console.error("Error sincronizando ingreso/factura tras edición:", error);
    return null;
  }
};

module.exports = {
  recordIncomeAndInvoice,
  getNextInvoiceFolio,
  deleteLinkedAccountingRecords,
  syncSingleSourceIncome,
};
