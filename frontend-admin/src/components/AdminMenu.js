import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { INFRA_ICONS } from "../utils/infraIcons";

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const AdminMenu = () => {
  const role = localStorage.getItem("role");
  const isSuperAdmin = role === "super_admin";

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState(null);

  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  };

  const loadStatus = useCallback(async () => {
    if (!isSuperAdmin) return;
    setIsLoading(true);
    setError("");
    try {
      const baseUrl = getApiBaseUrl();
      const response = await axios.get(`${baseUrl}/api/infra/status`, {
        headers: getAuthHeaders(),
      });
      setItems(response.data?.items || []);
      setCheckedAt(response.data?.checkedAt || null);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible verificar la infraestructura.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  const loadMetrics = useCallback(async () => {
    if (!isSuperAdmin) return;
    setMetricsLoading(true);
    setMetricsError("");
    try {
      const baseUrl = getApiBaseUrl();
      const response = await axios.get(`${baseUrl}/api/infra/metrics`, {
        headers: getAuthHeaders(),
      });
      setMetrics(response.data);
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === "PORTAINER_NOT_CONFIGURED") {
        setMetricsError("Falta configurar PORTAINER_URL / PORTAINER_API_TOKEN en el backend para ver el uso del servidor.");
      } else {
        setMetricsError(err.response?.data?.error?.message || "No fue posible obtener el uso del servidor.");
      }
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  useEffect(() => {
    loadStatus();
    loadMetrics();
  }, [loadStatus, loadMetrics]);

  return (
    <div>
      <h2>Panel administrativo</h2>
      <p>Este panel está enfocado al roadmap de eCommerce.</p>
      <ul>
        <li>Módulo de productos (pendiente)</li>
        <li>Módulo de inventario (pendiente)</li>
        <li>Módulo de pedidos (pendiente)</li>
      </ul>

      {isSuperAdmin ? (
        <>
          <section style={{ marginTop: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
              <h3 style={{ margin: 0 }}>Uso del servidor</h3>
              <button type="button" onClick={loadMetrics} disabled={metricsLoading} style={{ width: "auto" }}>
                {metricsLoading ? "Midiendo..." : "Actualizar uso"}
              </button>
            </div>
            {metrics?.checkedAt ? (
              <p style={{ fontSize: "0.8rem", margin: "0.4rem 0 0" }}>
                Última medición: {new Date(metrics.checkedAt).toLocaleTimeString()} · {metrics.containersRunning} contenedores activos
              </p>
            ) : null}

            {metricsError ? <div className="auth-error" style={{ marginTop: "1rem" }}>{metricsError}</div> : null}

            {metrics ? (
              <div className="metrics-grid">
                <div className="metric-tile">
                  <div className="metric-tile-head">
                    <i className="fas fa-microchip" aria-hidden="true" />
                    <span>Uso de CPU</span>
                  </div>
                  <div className="metric-value">{metrics.cpu.percent}%</div>
                  <div className="metric-bar">
                    <div className="metric-bar-fill" style={{ width: `${Math.min(100, metrics.cpu.percent)}%` }} />
                  </div>
                  <div className="metric-sub">{metrics.cpu.cores} núcleos</div>
                </div>

                <div className="metric-tile">
                  <div className="metric-tile-head">
                    <i className="fas fa-memory" aria-hidden="true" />
                    <span>Uso de memoria</span>
                  </div>
                  <div className="metric-value">{metrics.memory.percent}%</div>
                  <div className="metric-bar">
                    <div className="metric-bar-fill" style={{ width: `${Math.min(100, metrics.memory.percent)}%` }} />
                  </div>
                  <div className="metric-sub">
                    {formatBytes(metrics.memory.usedBytes)} de {formatBytes(metrics.memory.totalBytes)}
                  </div>
                </div>

                <div className="metric-tile">
                  <div className="metric-tile-head">
                    <i className="fas fa-hdd" aria-hidden="true" />
                    <span>Uso de disco</span>
                  </div>
                  <div className="metric-value">{metrics.disk.percent}%</div>
                  <div className="metric-bar">
                    <div className="metric-bar-fill" style={{ width: `${Math.min(100, metrics.disk.percent)}%` }} />
                  </div>
                  <div className="metric-sub">
                    {formatBytes(metrics.disk.usedBytes)} de {formatBytes(metrics.disk.totalBytes)} (footprint de Docker)
                  </div>
                </div>

                <div className="metric-tile">
                  <div className="metric-tile-head">
                    <i className="fas fa-arrow-down" aria-hidden="true" />
                    <span>Descarga (bajada)</span>
                  </div>
                  <div className="metric-value">{metrics.network.download.percent}%</div>
                  <div className="metric-bar">
                    <div className="metric-bar-fill" style={{ width: `${Math.min(100, metrics.network.download.percent)}%` }} />
                  </div>
                  <div className="metric-sub">
                    {formatBytes(metrics.network.download.bytes)} de {formatBytes(metrics.network.download.totalBytes)}
                  </div>
                </div>

                <div className="metric-tile">
                  <div className="metric-tile-head">
                    <i className="fas fa-arrow-up" aria-hidden="true" />
                    <span>Subida</span>
                  </div>
                  <div className="metric-value">{metrics.network.upload.percent}%</div>
                  <div className="metric-bar">
                    <div className="metric-bar-fill" style={{ width: `${Math.min(100, metrics.network.upload.percent)}%` }} />
                  </div>
                  <div className="metric-sub">
                    {formatBytes(metrics.network.upload.bytes)} de {formatBytes(metrics.network.upload.totalBytes)}
                  </div>
                </div>
              </div>
            ) : null}
            <p style={{ fontSize: "0.75rem", marginTop: "1rem" }}>
              Disco: solo footprint de Docker (imágenes, contenedores, volúmenes) — no incluye archivos fuera de Docker.
              <br />
              Red: acumulada desde que arrancaron los contenedores, no un contador mensual real del proveedor.
            </p>
          </section>

          <section style={{ marginTop: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
              <h3 style={{ margin: 0 }}>Infraestructura del servidor</h3>
              <button type="button" onClick={loadStatus} disabled={isLoading} style={{ width: "auto" }}>
                {isLoading ? "Verificando..." : "Actualizar estado"}
              </button>
            </div>
            {checkedAt ? (
              <p style={{ fontSize: "0.8rem", margin: "0.4rem 0 0" }}>
                Última verificación: {new Date(checkedAt).toLocaleTimeString()}
              </p>
            ) : null}

            {error ? <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div> : null}

            <div className="infra-grid">
              {items.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`infra-card infra-card-${item.status}`}
                >
                  <i className={INFRA_ICONS[item.id] || "fas fa-server"} aria-hidden="true" />
                  <span className="infra-card-label">{item.label}</span>
                  <span className="infra-card-status">
                    <span className="infra-card-dot" />
                    {item.status === "up" ? "En línea" : "Caído"}
                  </span>
                </a>
              ))}
              {!isLoading && items.length === 0 && !error ? <p>Sin datos de infraestructura todavía.</p> : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
};

export default AdminMenu;
