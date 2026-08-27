// Planes de hosting contratables por un cliente de agencia — deben coincidir
// con los precios reales publicados en frontend-user/src/components/Services.js
// (array PLANS) y con frontend-admin/src/utils/hostingPlans.js (duplicado ahí
// porque frontend-admin/backend son paquetes npm separados, sin monorepo).
// "enterprise" no tiene precio fijo ("bajo cotización" en el sitio público):
// su costo mensual se captura a mano por cliente en vez de derivarse aquí.
const HOSTING_PLANS = {
  basic: { label: "Basic", price: 250 },
  medium: { label: "Medium", price: 500 },
  advanced: { label: "Advanced", price: 750 },
  enterprise: { label: "Enterprise", price: null },
};

const HOSTING_PLAN_IDS = Object.keys(HOSTING_PLANS);

module.exports = { HOSTING_PLANS, HOSTING_PLAN_IDS };
