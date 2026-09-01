// Gancho compartido: cuando un cliente paga (hosting o un abono a deuda de
// diseño), esto genera automáticamente el ingreso en contabilidad. Se usa
// desde agencyClient.routes.js — nunca desde una ruta propia, para no exponer
// una forma de "inyectar" ingresos falsos que parezcan venir de un pago real.
//
// La factura ya NO se genera aquí ni automáticamente: facturar es siempre un
// paso manual desde Facturación, donde se seleccionan uno o más movimientos
// del mismo cliente/mes (ver backend/routes/invoices.routes.js). Una vez que
// un movimiento queda ligado a una factura (`Transaction.invoice` seteado),
// el pago/deuda que lo originó queda protegido: no se puede editar su monto
// ni eliminarlo directamente (rompería el total ya facturado) — hay que
// verificarlo con `isSourceInvoiced` antes de mutar el registro de origen.
const Transaction = require("../models/transaction.model");
const Invoice = require("../models/invoice.model");

const getNextInvoiceFolio = async () => {
  const last = await Invoice.findOne().sort({ folio: -1 }).select("folio").lean();
  return (last?.folio || 0) + 1;
};

/**
 * true si alguna Transaction ligada a este origen (pago de hosting o deuda de
 * diseño) ya forma parte de una factura. Los call-sites en agencyClient.routes.js
 * deben llamar esto ANTES de mutar/eliminar el pago/deuda de origen, para
 * responder 409 sin dejar el registro de origen editado/borrado a medias.
 */
const isSourceInvoiced = async ({ sourceCollection, sourceId }) => {
  const invoicedTransaction = await Transaction.exists({
    sourceCollection,
    sourceId,
    invoice: { $ne: null },
  });
  return Boolean(invoicedTransaction);
};

/**
 * Crea la transacción de ingreso de un pago de cliente. No lanza: si algo
 * falla aquí, el pago en sí ya se guardó correctamente y no debe perderse por
 * un error secundario de contabilidad; solo se deja constancia en el log.
 */
const recordIncome = async ({ client, amount, date, category, description, sourceCollection, sourceId }) => {
  if (!(amount > 0)) return null; // sin monto, no hay nada que registrar

  try {
    const source = sourceCollection === "HostingPayment" ? "hosting_payment" : "design_debt";

    return await Transaction.create({
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
  } catch (error) {
    console.error("Error generando transacción automática:", error);
    return null;
  }
};

/**
 * Contraparte de recordIncome: cuando se elimina un pago de hosting o una
 * deuda de diseño desde la ficha del cliente, borra también la(s)
 * transacción(es) que se generaron automáticamente a partir de ese registro
 * (identificadas por sourceCollection+sourceId), para que el saldo de
 * contabilidad no quede con un ingreso "fantasma" de un pago que ya no
 * existe. Un DesignDebt puede tener varias transacciones ligadas (un abono
 * parcial por edición genera una transacción nueva cada vez), por eso se
 * borran todas las que coincidan, no solo una.
 *
 * Precondición: el caller ya verificó `isSourceInvoiced` en false — esta
 * función no vuelve a chequearlo (borraría bajo los pies de una factura ya
 * emitida). También limpia cualquier Invoice legacy con el mismo
 * sourceCollection/sourceId como red de seguridad (facturas automáticas de
 * antes de este cambio que aún no se hayan enlazado vía el script de backfill).
 * Tampoco lanza, por la misma razón que recordIncome.
 */
const deleteLinkedAccountingRecords = async ({ sourceCollection, sourceId }) => {
  try {
    await Promise.all([
      Transaction.deleteMany({ sourceCollection, sourceId }),
      Invoice.deleteMany({ sourceCollection, sourceId }),
    ]);
  } catch (error) {
    console.error("Error eliminando transacciones ligadas:", error);
  }
};

/**
 * Mantiene en sincronía el ingreso de un registro que tiene, cuando mucho,
 * UNA transacción ligada (hosting payments: un pago = un ingreso). NO usar
 * con DesignDebt, donde varios abonos sucesivos generan varias transacciones
 * con el mismo sourceId a propósito (ver recordIncome).
 *
 * Se llama al editar el pago, no solo al crearlo, para que un cambio de monto
 * o fecha quede reflejado en contabilidad en vez de dejar la transacción
 * vieja con el valor original. Precondición: el caller ya verificó
 * `isSourceInvoiced` en false (mismo motivo que deleteLinkedAccountingRecords).
 *   - Si ya existía una transacción ligada: se actualiza en el mismo lugar.
 *   - Si no existía y el nuevo monto es > 0 (el pago se creó sin monto y
 *     ahora se le puso uno): se crea, igual que en el alta.
 *   - Si el nuevo monto queda en 0/vacío: se borra la transacción ligada, si había.
 * Tampoco lanza, por la misma razón que el resto de este módulo.
 */
const syncSingleSourceIncome = async ({ client, amount, date, category, description, sourceCollection, sourceId }) => {
  try {
    const existingTransaction = await Transaction.findOne({ sourceCollection, sourceId });

    if (!(amount > 0)) {
      if (existingTransaction) {
        await deleteLinkedAccountingRecords({ sourceCollection, sourceId });
      }
      return null;
    }

    if (!existingTransaction) {
      return recordIncome({ client, amount, date, category, description, sourceCollection, sourceId });
    }

    existingTransaction.amount = amount;
    existingTransaction.date = date;
    existingTransaction.category = category;
    existingTransaction.description = description;
    await existingTransaction.save();

    return null;
  } catch (error) {
    console.error("Error sincronizando ingreso tras edición:", error);
    return null;
  }
};

module.exports = {
  recordIncome,
  getNextInvoiceFolio,
  isSourceInvoiced,
  deleteLinkedAccountingRecords,
  syncSingleSourceIncome,
};
