// Cliente mínimo para la API de Portainer, usado para aproximar el uso de
// recursos del VPS completo (CPU/memoria/disco/red) sumando el uso de todos
// los contenedores del host — Portainer ya tiene visibilidad total del
// Docker daemon del servidor, así que no requiere infraestructura nueva.
//
// Requiere en el entorno del backend:
//   PORTAINER_URL=https://portainer.server.duck-hack.cloud
//   PORTAINER_API_TOKEN=<token generado en Portainer: My account > API tokens>
//   PORTAINER_ENDPOINT_ID=<opcional; si Portainer solo tiene un ambiente, se autodetecta>
const PORTAINER_URL = (process.env.PORTAINER_URL || "").replace(/\/+$/, "");
const PORTAINER_API_TOKEN = process.env.PORTAINER_API_TOKEN || "";
const CONFIGURED_ENDPOINT_ID = (process.env.PORTAINER_ENDPOINT_ID || "").trim();
const REQUEST_TIMEOUT_MS = 8000;

// Capacidad total del VPS (plan de hosting) — no viene de Portainer, se
// configura a mano porque Portainer no conoce el plan contratado.
const DISK_TOTAL_BYTES = (Number(process.env.SERVER_DISK_TOTAL_GB) || 200) * 1024 ** 3;
const BANDWIDTH_TOTAL_BYTES = (Number(process.env.SERVER_BANDWIDTH_TOTAL_TB) || 16) * 1024 ** 4;

class PortainerConfigError extends Error {}
class PortainerRequestError extends Error {}

const isConfigured = () => Boolean(PORTAINER_URL && PORTAINER_API_TOKEN);

const portainerFetch = async (path) => {
  let response;
  try {
    response = await fetch(`${PORTAINER_URL}${path}`, {
      headers: { "X-API-Key": PORTAINER_API_TOKEN },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new PortainerRequestError(`No fue posible contactar Portainer en ${path}: ${error.message}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new PortainerRequestError(`Portainer respondió ${response.status} en ${path}: ${body.slice(0, 200)}`);
  }
  return response.json();
};

const resolveEndpointId = async () => {
  if (CONFIGURED_ENDPOINT_ID) return CONFIGURED_ENDPOINT_ID;

  const endpoints = await portainerFetch("/api/endpoints");
  if (Array.isArray(endpoints) && endpoints.length === 1) {
    return endpoints[0].Id;
  }

  const names = Array.isArray(endpoints) ? endpoints.map((e) => `${e.Id}:${e.Name}`).join(", ") : "";
  throw new PortainerConfigError(
    !endpoints || endpoints.length === 0
      ? "Portainer no tiene ambientes (endpoints) configurados."
      : `Portainer tiene ${endpoints.length} ambientes; define PORTAINER_ENDPOINT_ID explícitamente. Disponibles: ${names}`
  );
};

// Fórmula estándar de "docker stats" (Docker Engine API): el % de un
// contenedor ya viene normalizado como fracción de UN solo core, así que
// sumar entre contenedores y dividir entre NCPU da el % de capacidad total
// del host usado.
const calculateCpuPercent = (stats) => {
  const cpuDelta = (stats?.cpu_stats?.cpu_usage?.total_usage || 0) - (stats?.precpu_stats?.cpu_usage?.total_usage || 0);
  const systemDelta = (stats?.cpu_stats?.system_cpu_usage || 0) - (stats?.precpu_stats?.system_cpu_usage || 0);
  const onlineCpus = stats?.cpu_stats?.online_cpus || stats?.cpu_stats?.cpu_usage?.percpu_usage?.length || 1;
  if (!(systemDelta > 0) || !(cpuDelta > 0)) return 0;
  return (cpuDelta / systemDelta) * onlineCpus * 100;
};

// Resta el cache de página (cgroup v1: "cache", cgroup v2: "inactive_file")
// para acercarse al "uso real" que muestra docker stats, en vez del total
// crudo que incluye cache reclamable.
const calculateMemoryUsedBytes = (stats) => {
  const usage = stats?.memory_stats?.usage || 0;
  const cache = stats?.memory_stats?.stats?.cache ?? stats?.memory_stats?.stats?.inactive_file ?? 0;
  return Math.max(0, usage - cache);
};

const sumNetworkBytes = (stats) => {
  const networks = stats?.networks || {};
  return Object.values(networks).reduce(
    (acc, iface) => ({
      rx: acc.rx + (iface?.rx_bytes || 0),
      tx: acc.tx + (iface?.tx_bytes || 0),
    }),
    { rx: 0, tx: 0 }
  );
};

const round1 = (n) => Math.round(n * 10) / 10;

const getServerMetrics = async () => {
  if (!isConfigured()) {
    throw new PortainerConfigError("PORTAINER_URL y/o PORTAINER_API_TOKEN no están configurados en el backend.");
  }

  const endpointId = await resolveEndpointId();
  const base = `/api/endpoints/${endpointId}/docker`;

  const [info, containers, df] = await Promise.all([
    portainerFetch(`${base}/info`),
    portainerFetch(`${base}/containers/json?all=false`),
    portainerFetch(`${base}/system/df`),
  ]);

  // Cada stats?stream=false puede fallar individualmente (contenedor detenido
  // entre el listado y la consulta, timeout puntual) sin tumbar el endpoint completo.
  const statsList = await Promise.all(
    (containers || []).map((c) => portainerFetch(`${base}/containers/${c.Id}/stats?stream=false`).catch(() => null))
  );

  let cpuPercentSum = 0;
  let memoryUsedBytes = 0;
  let rxBytes = 0;
  let txBytes = 0;

  for (const stats of statsList) {
    if (!stats) continue;
    cpuPercentSum += calculateCpuPercent(stats);
    memoryUsedBytes += calculateMemoryUsedBytes(stats);
    const net = sumNetworkBytes(stats);
    rxBytes += net.rx;
    txBytes += net.tx;
  }

  const ncpu = info?.NCPU || 1;
  const memTotal = info?.MemTotal || 0;
  const cpuPercent = ncpu > 0 ? Math.min(100, cpuPercentSum / ncpu) : 0;
  const memoryPercent = memTotal > 0 ? Math.min(100, (memoryUsedBytes / memTotal) * 100) : 0;

  // Uso de disco de Docker (capas de imágenes + capa escribible de contenedores
  // + volúmenes). No incluye disco fuera de Docker (SO, logs del host, etc.),
  // así que subestima el uso real del VPS — es un piso, no el total exacto.
  const diskUsedBytes =
    (df?.LayersSize || 0) +
    (df?.Containers || []).reduce((acc, c) => acc + (c?.SizeRw || 0), 0) +
    (df?.Volumes || []).reduce((acc, v) => acc + (v?.UsageData?.Size > 0 ? v.UsageData.Size : 0), 0);

  const diskPercent = DISK_TOTAL_BYTES > 0 ? Math.min(100, (diskUsedBytes / DISK_TOTAL_BYTES) * 100) : 0;
  const downloadPercent = BANDWIDTH_TOTAL_BYTES > 0 ? Math.min(100, (rxBytes / BANDWIDTH_TOTAL_BYTES) * 100) : 0;
  const uploadPercent = BANDWIDTH_TOTAL_BYTES > 0 ? Math.min(100, (txBytes / BANDWIDTH_TOTAL_BYTES) * 100) : 0;

  return {
    cpu: { percent: round1(cpuPercent), cores: ncpu },
    memory: { usedBytes: memoryUsedBytes, totalBytes: memTotal, percent: round1(memoryPercent) },
    disk: { usedBytes: diskUsedBytes, totalBytes: DISK_TOTAL_BYTES, percent: round1(diskPercent) },
    network: {
      download: { bytes: rxBytes, totalBytes: BANDWIDTH_TOTAL_BYTES, percent: round1(downloadPercent) },
      upload: { bytes: txBytes, totalBytes: BANDWIDTH_TOTAL_BYTES, percent: round1(uploadPercent) },
    },
    containersRunning: (containers || []).length,
    checkedAt: new Date().toISOString(),
  };
};

module.exports = { getServerMetrics, PortainerConfigError, PortainerRequestError };
