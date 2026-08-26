import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { INFRA_ICONS } from "../utils/infraIcons";

const AdminMenu = () => {
  const role = localStorage.getItem("role");
  const isSuperAdmin = role === "super_admin";

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState(null);

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

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

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
      ) : null}
    </div>
  );
};

export default AdminMenu;
