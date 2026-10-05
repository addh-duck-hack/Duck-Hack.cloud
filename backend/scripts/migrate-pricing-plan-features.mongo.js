// Uso:
// mongosh "mongodb://localhost:27017/duckhackdb" backend/scripts/migrate-pricing-plan-features.mongo.js
//
// Contexto: los planes de precio de StoreConfig (pricingPlans) tenían cuatro
// campos fijos de hosting — storage, emailAccounts, bandwidth y ssl. Ahora cada
// plan tiene una lista libre de características `features: [{ name, value }]`
// (packages/core-api/modules/storeConfig.js), para que cualquier giro defina
// las suyas (Sesiones: 4, Duración: 60 min…).
//
// Recomendado, no obligatorio: al guardar desde el admin, el backend ya
// convierte esos campos (storeConfig.js#validatePricingPlanItem). Lo que
// aporta este script es dejar la base limpia sin que nadie tenga que abrir y
// guardar "Configurar tienda", para que GET /api/store-config/public ya
// devuelva `features`.
//
// Qué hace: en cada plan que todavía tenga alguno de los cuatro campos, agrega
// a `features` los que tengan valor (Almacenamiento, Cuentas de correo, Ancho
// de banda, SSL — sin repetir un nombre que ya exista) y quita los campos.
// Idempotente: un plan sin esos campos no se toca; la segunda corrida no
// cambia nada.

const LEGACY = [
  ["storage", "Almacenamiento"],
  ["emailAccounts", "Cuentas de correo"],
  ["bandwidth", "Ancho de banda"],
  ["ssl", "SSL"],
];

let configsUpdated = 0;
let plansUpdated = 0;

db.storeconfigs.find({ pricingPlans: { $exists: true, $ne: [] } }).forEach((config) => {
  let changed = false;
  const plans = (config.pricingPlans || []).map((plan) => {
    if (!LEGACY.some(([field]) => field in plan)) return plan;
    changed = true;
    plansUpdated += 1;
    const next = { ...plan };
    const features = Array.isArray(plan.features) ? [...plan.features] : [];
    const names = new Set(features.map((f) => String(f.name || "").trim().toLowerCase()));
    LEGACY.forEach(([field, label]) => {
      const value = String(plan[field] ?? "").trim();
      if (value && !names.has(label.toLowerCase())) features.push({ name: label, value });
      delete next[field];
    });
    next.features = features;
    return next;
  });
  if (changed) {
    db.storeconfigs.updateOne({ _id: config._id }, { $set: { pricingPlans: plans } });
    configsUpdated += 1;
  }
});

print(`Configuraciones actualizadas: ${configsUpdated}`);
print(`Planes convertidos a características: ${plansUpdated}`);
