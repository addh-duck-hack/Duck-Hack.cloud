// Debe mantenerse sincronizado con backend/utils/hostingPlans.js y con los
// precios reales publicados en frontend-user/src/components/Services.js
// (array PLANS). "enterprise" no tiene precio fijo ("bajo cotización" en el
// sitio público) — su costo mensual se captura a mano por cliente.
// "free" no es un plan comercial: es para servicios/dominios propios de la
// agencia (no de un cliente) que igual hay que mapear en el módulo porque
// generan gasto (dominio, hosting, licencias, docker) — solo que ese gasto se
// registra como egreso en Contabilidad, no como cobro de hosting. Por eso no
// aparece en Services.js (no se vende).
export const HOSTING_PLANS = {
  free: { label: "Free (uso interno)", price: 0 },
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
