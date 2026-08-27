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
    <section>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem" }}>
        <button type="button" onClick={() => navigate("/admin/agency-clients/new")} style={{ width: "auto" }}>
          Nuevo cliente
        </button>
        <button type="button" onClick={loadClients} disabled={isLoading} className="btn-secondary" style={{ width: "auto" }}>
          {isLoading ? "Cargando..." : "Recargar"}
        </button>
      </div>

      <h3>Clientes de agencia</h3>
      <p>Control interno de hosting y deudas de diseño. Uso confidencial (solo super_admin).</p>

      {error ? <div className="auth-error">{error}</div> : null}

      {!isLoading && clients.length === 0 && !error ? <p>No hay clientes de agencia registrados.</p> : null}

      {/* isActive no siempre viene en el payload de clientes viejos; por
          default del modelo se consideran activos si no se especifica. */}
      {(() => {
        const activeClients = clients.filter((c) => c.isActive !== false);
        const inactiveClients = clients.filter((c) => c.isActive === false);

        const renderCard = (client) => {
          const hostingBadge = getDateStatusBadge(client.hostingPaidUntil, { emptyLabel: "Sin pagos" });
          const domainBadge = client.domain
            ? getDateStatusBadge(client.domainExpiresAt, { emptyLabel: "Sin fecha registrada" })
            : null;
          const isInactive = client.isActive === false;

          return (
            <a
              key={client._id}
              href={`#/admin/agency-clients/${client._id}`}
              className={`client-card${isInactive ? " client-card-inactive" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/admin/agency-clients/${client._id}`);
              }}
            >
              <div className="client-card-name">
                {client.businessName}
                {isInactive ? (
                  <span className="badge badge-red" style={{ marginLeft: "0.6rem", verticalAlign: "middle" }}>
                    Inactivo
                  </span>
                ) : null}
              </div>
              <div className="client-card-plan">
                {client.hostingPlan ? (
                  <>
                    {HOSTING_PLANS[client.hostingPlan].label}
                    {typeof client.hostingMonthlyCost === "number" ? ` · ${formatCurrency(client.hostingMonthlyCost)}/mes` : ""}
                  </>
                ) : (
                  "Sin plan asignado"
                )}
              </div>

              <div className="client-card-row">
                <span>Hosting</span>
                <span className={`badge badge-${hostingBadge.color}`}>{hostingBadge.label}</span>
              </div>

              <div className="client-card-row">
                <span>Dominio</span>
                {domainBadge ? (
                  <span className={`badge badge-${domainBadge.color}`}>{domainBadge.label}</span>
                ) : (
                  <span>—</span>
                )}
              </div>

              <div className="client-card-row">
                <span>Deuda de diseño</span>
                <span>
                  {client.pendingDebtTotal > 0 ? `${formatCurrency(client.pendingDebtTotal)} (${client.pendingDebtCount})` : "Sin deuda"}
                </span>
              </div>
            </a>
          );
        };

        return (
          <>
            {activeClients.length > 0 ? (
              <div className="client-grid">{activeClients.map(renderCard)}</div>
            ) : null}

            {inactiveClients.length > 0 ? (
              <>
                <div className="client-grid-section-title">Inactivos ({inactiveClients.length})</div>
                <div className="client-grid">{inactiveClients.map(renderCard)}</div>
              </>
            ) : null}
          </>
        );
      })()}
    </section>
  );
};

export default AgencyClientList;
