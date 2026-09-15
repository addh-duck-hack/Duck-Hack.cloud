// Catálogo de bancos para el dropdown de "Banco receptor" en Configurar
// tienda > Pagos (SPEI). Debe mantenerse sincronizado a mano con
// packages/core-api/modules/storeConfig.js#MEXICAN_BANKS (mismo criterio de
// duplicación que utils/hostingPlans.js — no hay paquete compartido entre
// backend y frontend-admin). "Otro" es la válvula de escape para un banco no
// listado.
export const MEXICAN_BANKS = [
  "BBVA México",
  "Banorte",
  "Santander",
  "Citibanamex",
  "HSBC México",
  "Scotiabank México",
  "Banco Azteca",
  "Inbursa",
  "BanBajío",
  "Banregio",
  "Afirme",
  "Multiva",
  "Mifel",
  "BanCoppel",
  "Actinver",
  "CIBanco",
  "Intercam Banco",
  "Consubanco",
  "Banco Ve por Más (BX+)",
  "STP",
  "Nu México",
  "Mercado Pago",
  "Klar",
  "Hey Banco",
  "Otro",
];
