// src/utils/storeConfigLists.js
//
// Helper compartido para las listas de store-config (heroSlides, metrics,
// services, pricingPlans, faqs, teamMembers, testimonials): descarta los
// items inactivos y ordena por sortOrder. Mismo criterio en todos los
// componentes que consumen estas listas.
export const sortActive = (items) =>
  [...items].filter((item) => item.isActive !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

// `config?.campo?.length ? sortActive(config.campo) : fallback` es el patrón
// repetido en cada componente — este helper lo centraliza.
export const pickList = (configList, fallback) => (configList?.length ? sortActive(configList) : fallback);
