// Métricas con valor automático de StoreConfig.metrics (source distinto de
// "manual"). Movido desde modules/storeConfig.js: lo usan GET
// /api/store-config/public y las secciones storeMetrics de GET
// /api/app-home/public (modules/appHome.js), con el mismo
// ctx.resolveLiveMetricSources que arma backend/server.js.
//
// Generaliza backend/routes/storeConfig.routes.js#resolveLiveMetrics: en vez
// de llamar directo a AgencyClient/Portainer, resuelve cada `source` no
// "manual" a través del mapa opcional resolveLiveMetricSources — nunca deja
// que un fallo acá tumbe /public (mejor mostrar el placeholder guardado que
// romper el storefront).
const resolveLiveMetrics = async (metrics, resolveLiveMetricSources = {}) => {
  if (!Array.isArray(metrics) || metrics.length === 0) return metrics;

  const neededSources = [...new Set(metrics.map((m) => m.source).filter((s) => s && s !== "manual"))];
  if (neededSources.length === 0) return metrics;

  const resolved = {};
  await Promise.allSettled(
    neededSources.map(async (source) => {
      const resolver = resolveLiveMetricSources[source];
      if (!resolver) return;
      resolved[source] = await resolver();
    })
  );

  return metrics.map((m) => {
    if (m.source !== "manual" && resolved[m.source] !== undefined && resolved[m.source] !== null) {
      return { ...m, value: String(resolved[m.source]) };
    }
    return m; // fuente automática pero no se pudo calcular (o no se proveyó
    // resolver para ella): se mantiene el placeholder guardado.
  });
};

module.exports = { resolveLiveMetrics };
