// Uso:
// mongosh "mongodb://localhost:27017/duckhackdb" backend/scripts/migrate-pickup-statuses.mongo.js
//
// Corrida única al desplegar los estados propios de "recoger en tienda"
// (packages/core-api/modules/orders.js: ready_for_pickup / picked_up). Antes,
// los pedidos para recoger usaban los mismos estados que el envío a
// domicilio, así que los que se marcaron "Enviado" o "Entregado" quedaron con
// esos estados. Sin esto, el admin ya no deja guardar esos pedidos (el
// backend responde 400 STATUS_NOT_FOR_DELIVERY_METHOD) y en la tienda se ven
// con un estado que no corresponde.
//
// Qué hace, solo en pedidos con deliveryMethod "pickup":
//   shipped   → ready_for_pickup (readyForPickupAt = shipment.shippedAt, o la última actualización)
//   delivered → picked_up        (pickedUpAt = shipment.deliveredAt, o la última actualización)
// Idempotente: correrlo dos veces no hace nada la segunda vez.

const migrate = (from, to, dateField, sourceField) => {
  let count = 0;
  db.orders.find({ deliveryMethod: "pickup", status: from }).forEach((order) => {
    const when = (order.shipment && order.shipment[sourceField]) || order.updatedAt || new Date();
    db.orders.updateOne({ _id: order._id }, { $set: { status: to, [dateField]: when } });
    count += 1;
  });
  print(`Pedidos para recoger ${from} → ${to}: ${count}`);
};

migrate("shipped", "ready_for_pickup", "readyForPickupAt", "shippedAt");
migrate("delivered", "picked_up", "pickedUpAt", "deliveredAt");
