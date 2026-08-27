import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { HOSTING_PLANS } from "../utils/hostingPlans";
import { getDateStatusBadge } from "../utils/dateStatusBadge";

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
    <section style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem" }}>
        <button type="button" onClick={() => navigate("/admin/agency-clients/new")}>
          Nuevo cliente
        </button>
        <button type="button" onClick={loadClients} disabled={isLoading}>
          {isLoading ? "Cargando..." : "Recargar"}
        </button>
      </div>

      <h3>Clientes de agencia</h3>
      <p>Control interno de hosting y deudas de diseño. Uso confidencial (solo super_admin).</p>

      {error ? <div className="auth-error">{error}</div> : null}

      <table>
        <thead>
          <tr>
            <th>Negocio</th>
            <th>Contacto</th>
            <th>Plan</th>
            <th>Hosting</th>
            <th>Dominio</th>
            <th>Deuda de diseño</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {clients.length === 0 && !isLoading ? (
            <tr>
              <td colSpan={7}>No hay clientes de agencia registrados.</td>
            </tr>
          ) : null}
          {clients.map((client) => {
            const hostingBadge = getDateStatusBadge(client.hostingPaidUntil, { emptyLabel: "Sin pagos" });
            const domainBadge = client.domain
              ? getDateStatusBadge(client.domainExpiresAt, { emptyLabel: "Sin fecha registrada" })
              : null;
            return (
              <tr key={client._id}>
                <td>{client.businessName}</td>
                <td>{client.contactName || client.contactEmail || "—"}</td>
                <td>
                  {client.hostingPlan ? (
                    <>
                      {HOSTING_PLANS[client.hostingPlan].label}
                      {typeof client.hostingMonthlyCost === "number" ? (
                        <>
                          <br />
                          <small>{formatCurrency(client.hostingMonthlyCost)}/mes</small>
                        </>
                      ) : null}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span className={`badge badge-${hostingBadge.color}`}>{hostingBadge.label}</span>
                </td>
                <td>
                  {domainBadge ? (
                    <>
                      {client.domain}
                      <br />
                      <span className={`badge badge-${domainBadge.color}`}>{domainBadge.label}</span>
                    </>
                  ) : (
                    "—"
                  )}
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
