// Debe mantenerse sincronizado con backend/utils/hostingPlans.js y con los
// precios reales publicados en frontend-user/src/components/Services.js
// (array PLANS). "enterprise" no tiene precio fijo ("bajo cotización" en el
// sitio público) — su costo mensual se captura a mano por cliente.
export const HOSTING_PLANS = {
  basic: { label: "Basic", price: 250 },
  medium: { label: "Medium", price: 500 },
  advanced: { label: "Advanced", price: 750 },
  enterprise: { label: "Enterprise", price: null },
};

export const HOSTING_PLAN_IDS = Object.keys(HOSTING_PLANS);

export const formatMxn = (value) =>
  typeof value === "number"
    ? value.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
    : "—";
