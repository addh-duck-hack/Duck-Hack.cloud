// Uso:
// mongosh "mongodb://localhost:27017/duckhackdb" backend/scripts/backfill-invoice-transaction-links.mongo.js
//
// Corrida única al desplegar el cambio "facturación por selección de
// movimientos": antes de este cambio, cada pago de hosting o abono a deuda
// generaba automáticamente su propia Transaction + Invoice (ligadas solo
// indirectamente por compartir sourceCollection+sourceId). Ahora que
// Transaction.invoice es el enlace explícito, este script lo rellena para
// las facturas ya emitidas — para que no vuelvan a aparecer como
// "pendientes de facturar" en la nueva pantalla de selección de movimientos.
// Las facturas en sí no se tocan (mismo folio, mismo PDF).
//
// Un DesignDebt puede tener varias Transaction + Invoice con el mismo
// sourceCollection/sourceId (un abono parcial por edición genera un par
// nuevo cada vez) — se emparejan por orden cronológico dentro de cada grupo,
// que es el mismo orden en que accountingHooks.js las creó originalmente.
//
// Idempotente: una Transaction ya enlazada (invoice != null) se salta, así
// que correrlo dos veces no duplica ni pisa enlaces existentes.

let linked = 0;
let skipped = 0;

const groups = {};
db.invoices
  .find({
    sourceCollection: { $in: ["HostingPayment", "DesignDebt"] },
    sourceId: { $exists: true, $ne: null },
  })
  .forEach((invoice) => {
    const key = `${invoice.sourceCollection}:${invoice.sourceId}`;
    if (!groups[key]) {
      groups[key] = { sourceCollection: invoice.sourceCollection, sourceId: invoice.sourceId, invoices: [] };
    }
    groups[key].invoices.push(invoice);
  });

Object.values(groups).forEach(({ sourceCollection, sourceId, invoices }) => {
  invoices.sort((a, b) => (a.issuedAt > b.issuedAt ? 1 : -1) || a.folio - b.folio);

  const transactions = db.transactions
    .find({ sourceCollection, sourceId })
    .sort({ date: 1, createdAt: 1 })
    .toArray();

  invoices.forEach((invoice, index) => {
    const transaction = transactions[index];
    if (!transaction) {
      print(`Sin transacción para factura folio ${invoice.folio} (${sourceCollection} ${sourceId}) — se omite.`);
      skipped += 1;
      return;
    }
    if (transaction.invoice) {
      skipped += 1; // ya enlazada (corrida previa del script, o revisión manual)
      return;
    }

    db.transactions.updateOne({ _id: transaction._id }, { $set: { invoice: invoice._id } });
    db.invoices.updateOne({ _id: invoice._id }, { $addToSet: { transactions: transaction._id } });
    linked += 1;
  });
});

print(`Backfill completado: ${linked} enlazadas, ${skipped} omitidas.`);
