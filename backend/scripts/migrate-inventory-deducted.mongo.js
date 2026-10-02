// Uso:
// mongosh "mongodb://localhost:27017/duckhackdb" backend/scripts/migrate-inventory-deducted.mongo.js
//
// Contexto: el inventario ahora se descuenta según el estado del pedido
// (packages/core-api/modules/orders.js#syncInventoryForOrder, campo
// Order.inventoryDeducted). Antes el stock solo estaba descontado mientras el
// pedido estaba en "confirmed": al avanzar a "processing"/"shipped" se
// regresaba, y un pedido que nunca pasó por "confirmed" nunca descontaba.
//
// Recomendado, no obligatorio: el backend ya completa el marcador de un
// pedido viejo al abrirlo (orders.js#backfillInventoryFlag). Lo que aporta
// este script es la LISTA del paso 2.
//
// Qué hace:
//   1. Marca inventoryDeducted = true en los pedidos "confirmed" (lo único
//      que la lógica vieja dejaba descontado) y false en todos los demás que
//      aún no tengan el campo. Así, al seguir avanzando, el backend no
//      vuelve a descontar lo que ya estaba descontado.
//   2. LISTA (no toca el inventario) los pedidos en estados posteriores al
//      pago que quedaron sin descontar, para que la tienda revise su
//      inventario a mano. No se ajusta stock retroactivamente: el inventario
//      pudo haberse corregido a mano desde entonces.
// Idempotente: solo toca pedidos sin el campo; la segunda corrida no cambia
// nada (solo vuelve a listar).

const missing = { inventoryDeducted: { $exists: false } };
const confirmed = db.orders.updateMany({ ...missing, status: "confirmed" }, { $set: { inventoryDeducted: true } });
const others = db.orders.updateMany(missing, { $set: { inventoryDeducted: false } });
print(`Marcados como descontados (confirmed): ${confirmed.modifiedCount}`);
print(`Marcados como no descontados (resto): ${others.modifiedCount}`);

const LATER = ["processing", "shipped", "delivered", "ready_for_pickup", "picked_up"];
const toReview = db.orders.find({ status: { $in: LATER }, inventoryDeducted: false }).sort({ orderNumber: 1 }).toArray();
print(`\nPedidos ya pagados/enviados cuyo inventario NO se descontó (revisar a mano): ${toReview.length}`);
toReview.forEach((o) => {
  const items = (o.items || []).map((i) => `${i.productName}${i.variantLabel ? ` (${i.variantLabel})` : ""} ×${i.quantity}`).join(", ");
  print(`  #${o.orderNumber} · ${o.status} · ${items}`);
});
