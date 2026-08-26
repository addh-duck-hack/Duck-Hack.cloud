import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const HOSTING_WARNING_DAYS = 15;

// Regla de presentación pura sobre "hoy": se calcula en el frontend para no
// acoplar el umbral de aviso al backend ni requerir redeploy si cambia.
const getHostingBadge = (hostingPaidUntil) => {
  if (!hostingPaidUntil) return { color: "red", label: "Sin pagos" };

  const until = new Date(hostingPaidUntil);
  const now = new Date();
  const warningThreshold = new Date(now.getTime() + HOSTING_WARNING_DAYS * 24 * 60 * 60 * 1000);

  if (until < now) return { color: "red", label: `Vencido (${until.toLocaleDateString()})` };
  if (until <= warningThreshold) return { color: "yellow", label: `Por vencer (${until.toLocaleDateString()})` };
  return { color: "green", label: `Al día (${until.toLocaleDateString()})` };
};

const formatCurrency = (value) => {
  if (!value) return "$0";
  return `$${Number(value).toLocaleString()}`;
};

const AgencyClientList = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const loadClients = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/agency-clients`, {
        headers: getAuthHeaders(),
      });
      setClients(response.data?.items || []);
    } catch (err) {
      const msg = err.response?.data?.error?.message || "No fue posible cargar los clientes de agencia.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section style={{ marginTop: "2rem", textAlign: "left", maxWidth: 1000, marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem" }}>
        <button type="button" onClick={() => navigate("/admin")}>
          Volver al panel
        </button>
        <button type="button" onClick={() => navigate("/admin/agency-clients/new")}>
          Nuevo cliente
        </button>
        <button type="button" onClick={loadClients} disabled={isLoading}>
          {isLoading ? "Cargando..." : "Recargar"}
        </button>
      </div>

      <h3>Clientes de agencia</h3>
      <p>Control interno de hosting y deudas de diseño. Uso confidencial (solo super_admin).</p>

      {error ? <p style={{ color: "#9d1c1c" }}>{error}</p> : null}

      <table>
        <thead>
          <tr>
            <th>Negocio</th>
            <th>Contacto</th>
            <th>Hosting</th>
            <th>Deuda de diseño</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {clients.length === 0 && !isLoading ? (
            <tr>
              <td colSpan={5}>No hay clientes de agencia registrados.</td>
            </tr>
          ) : null}
          {clients.map((client) => {
            const badge = getHostingBadge(client.hostingPaidUntil);
            return (
              <tr key={client._id}>
                <td>{client.businessName}</td>
                <td>{client.contactName || client.contactEmail || "—"}</td>
                <td>
                  <span className={`badge badge-${badge.color}`}>{badge.label}</span>
                </td>
                <td>
                  {client.pendingDebtTotal > 0
                    ? `${formatCurrency(client.pendingDebtTotal)} (${client.pendingDebtCount})`
                    : "Sin deuda"}
                </td>
                <td>
                  <button type="button" onClick={() => navigate(`/admin/agency-clients/${client._id}`)}>
                    Ver ficha
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};

export default AgencyClientList;
