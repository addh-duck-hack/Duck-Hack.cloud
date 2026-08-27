import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { HOSTING_PLANS } from "../utils/hostingPlans";
import { getDateStatusBadge } from "../utils/dateStatusBadge";
import { formatBytes } from "../utils/formatBytes";

const formatCurrency = (value) => `$${Number(value || 0).toLocaleString()}`;
const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : "—");

const DOCKER_STATE_LABELS = {
  running: "Corriendo",
  exited: "Detenido",
  paused: "Pausado",
  not_found: "No encontrado",
};

const AgencyClientDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [client, setClient] = useState(null);
  const [payments, setPayments] = useState([]);
  const [debts, setDebts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [dockerStatus, setDockerStatus] = useState(null);
  const [dockerError, setDockerError] = useState("");
  const [dockerLoading, setDockerLoading] = useState(false);

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [clientRes, paymentsRes, debtsRes] = await Promise.all([
        axios.get(`${baseUrl}/api/agency-clients/${id}`, { headers: getAuthHeaders() }),
        axios.get(`${baseUrl}/api/agency-clients/${id}/hosting-payments`, { headers: getAuthHeaders() }),
        axios.get(`${baseUrl}/api/agency-clients/${id}/design-debts`, { headers: getAuthHeaders() }),
      ]);
      setClient(clientRes.data);
      setPayments(paymentsRes.data?.items || []);
      setDebts(debtsRes.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar la ficha del cliente.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadDockerStatus = useCallback(async () => {
    setDockerLoading(true);
    setDockerError("");
    try {
      const response = await axios.get(`${baseUrl}/api/agency-clients/${id}/docker-status`, { headers: getAuthHeaders() });
      setDockerStatus(response.data?.items || []);
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setDockerError(
        code === "PORTAINER_NOT_CONFIGURED"
          ? "Portainer no está configurado en el backend."
          : err.response?.data?.error?.message || "No fue posible consultar el estado de los contenedores."
      );
    } finally {
      setDockerLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (client?.dockerContainers?.length > 0) {
      loadDockerStatus();
    }
  }, [client, loadDockerStatus]);

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm("¿Eliminar este pago? También se eliminará el ingreso y la factura que se generaron automáticamente en contabilidad.")) {
      return;
    }
    setError("");
    setMessage("");
    try {
      await axios.delete(`${baseUrl}/api/agency-clients/${id}/hosting-payments/${paymentId}`, {
        headers: getAuthHeaders(),
      });
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar el pago.");
    }
  };

  const handleMarkDebtPaid = async (debt) => {
    setError("");
    setMessage("");
    try {
      await axios.put(
        `${baseUrl}/api/agency-clients/${id}/design-debts/${debt._id}`,
        { amountPaid: debt.amount },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible actualizar la deuda.");
    }
  };

  const handleDeleteDebt = async (debtId) => {
    if (!window.confirm("¿Eliminar esta deuda? También se eliminarán los ingresos y facturas que se generaron automáticamente por sus abonos.")) {
      return;
    }
    setError("");
    setMessage("");
    try {
      await axios.delete(`${baseUrl}/api/agency-clients/${id}/design-debts/${debtId}`, {
        headers: getAuthHeaders(),
      });
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar la deuda.");
    }
  };

  const handleToggleActive = async () => {
    setError("");
    setMessage("");
    try {
      await axios.put(
        `${baseUrl}/api/agency-clients/${id}`,
        { isActive: !client.isActive },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setMessage(client.isActive ? "Cliente marcado como inactivo." : "Cliente marcado como activo.");
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible actualizar el estado del cliente.");
    }
  };

  const handleDeleteClient = async () => {
    if (!window.confirm(`¿Eliminar definitivamente a "${client.businessName}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setError("");
    setMessage("");
    try {
      await axios.delete(`${baseUrl}/api/agency-clients/${id}`, { headers: getAuthHeaders() });
      navigate("/admin/agency-clients");
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setError(
        code === "AGENCY_CLIENT_HAS_RELATED_RECORDS"
          ? "No se puede eliminar: el cliente tiene pagos de hosting o deudas de diseño registrados. Elimina primero ese historial, o márcalo como inactivo en su lugar."
          : err.response?.data?.error?.message || "No fue posible eliminar el cliente."
      );
    }
  };

  if (isLoading && !client) {
    return <p>Cargando...</p>;
  }

  // `GET /:id` devuelve el documento crudo del cliente (sin `hostingPaidUntil`,
  // que solo se calcula vía agregación en el listado `GET /`) — aquí se deriva
  // del propio historial de pagos que ya se cargó, tomando el `coversUntil` más
  // lejano (los pagos vienen ordenados por el backend con `coversUntil: -1`).
  const hostingPaidUntil = payments[0]?.coversUntil;
  const hostingBadge = client ? getDateStatusBadge(hostingPaidUntil, { emptyLabel: "Sin pagos" }) : null;
  const domainBadge = client?.domain
    ? getDateStatusBadge(client.domainExpiresAt, { emptyLabel: "Sin fecha registrada" })
    : null;

  return (
    <section style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button type="button" className="btn-secondary" onClick={() => navigate("/admin/agency-clients")} style={{ width: "auto" }}>
          ← Volver a la cuadrícula
        </button>
        {client ? (
          <>
            <button type="button" onClick={() => navigate(`/admin/agency-clients/${id}/edit`)} style={{ width: "auto" }}>
              Editar datos
            </button>
            <button type="button" className="btn-secondary" onClick={handleToggleActive} style={{ width: "auto" }}>
              {client.isActive ? "Marcar inactivo" : "Marcar activo"}
            </button>
            <button type="button" className="btn-danger" onClick={handleDeleteClient} style={{ width: "auto" }}>
              Eliminar cliente
            </button>
          </>
        ) : null}
      </div>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      {client ? (
        <>
          <h3>
            {client.businessName}
            {!client.isActive ? (
              <span className="badge badge-red" style={{ marginLeft: "0.75rem", verticalAlign: "middle" }}>
                Inactivo
              </span>
            ) : null}
          </h3>
          <p>
            {client.contactName || "—"} · {client.contactEmail || "—"} · {client.contactPhone || "—"}
          </p>
          <p>
            Sitio: {client.siteUrl || "—"}
          </p>
          <p>
            Plan: {client.hostingPlan ? HOSTING_PLANS[client.hostingPlan].label : "—"}
            {typeof client.hostingMonthlyCost === "number" ? ` — ${formatCurrency(client.hostingMonthlyCost)}/mes` : ""}
          </p>
          {client.notes ? <p>Notas: {client.notes}</p> : null}

          {/* --- Alertas: lo más importante de un vistazo --- */}
          {(hostingBadge && hostingBadge.color !== "green") || (domainBadge && domainBadge.color !== "green") ? (
            <div style={{ marginTop: "1.5rem" }}>
              {hostingBadge && hostingBadge.color !== "green" ? (
                <div className={`client-alert client-alert-${hostingBadge.color === "red" ? "danger" : "warning"}`}>
                  <i className="fas fa-triangle-exclamation" aria-hidden="true" />
                  Hosting: {hostingBadge.label}
                </div>
              ) : null}
              {domainBadge && domainBadge.color !== "green" ? (
                <div className={`client-alert client-alert-${domainBadge.color === "red" ? "danger" : "warning"}`}>
                  <i className="fas fa-triangle-exclamation" aria-hidden="true" />
                  Dominio ({client.domain}): {domainBadge.label}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* --- Estado de contenedores Docker --- */}
          {client.dockerContainers?.length > 0 ? (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2rem" }}>
                <h4 style={{ margin: 0 }}>Contenedores Docker</h4>
                <button type="button" className="btn-secondary" onClick={loadDockerStatus} disabled={dockerLoading} style={{ width: "auto" }}>
                  {dockerLoading ? "Consultando..." : "Actualizar"}
                </button>
              </div>
              {dockerError ? <div className="auth-error">{dockerError}</div> : null}
              <div className="docker-grid">
                {(dockerStatus || []).map((container) => (
                  <div key={container.name} className="docker-card">
                    <div className="docker-card-name">{container.name}</div>
                    <span className={`badge badge-${container.state === "running" ? "green" : container.state === "exited" ? "yellow" : "red"}`}>
                      {DOCKER_STATE_LABELS[container.state] || container.state}
                    </span>
                    {container.found ? (
                      <>
                        <div className="docker-card-stat">
                          <span>Estado</span>
                          <span>{container.status || "—"}</span>
                        </div>
                        <div className="docker-card-stat">
                          <span>Peso de imagen</span>
                          <span>{container.imageSizeBytes != null ? formatBytes(container.imageSizeBytes) : "—"}</span>
                        </div>
                        <div className="docker-card-stat">
                          <span>Capa escribible</span>
                          <span>{container.writableLayerSizeBytes != null ? formatBytes(container.writableLayerSizeBytes) : "—"}</span>
                        </div>
                        {container.cpuPercent != null ? (
                          <div className="docker-card-stat">
                            <span>CPU</span>
                            <span>{container.cpuPercent}%</span>
                          </div>
                        ) : null}
                        {container.memoryUsedBytes != null ? (
                          <div className="docker-card-stat">
                            <span>Memoria</span>
                            <span>{formatBytes(container.memoryUsedBytes)}</span>
                          </div>
                        ) : null}
                        {container.network ? (
                          <div className="docker-card-stat">
                            <span>Red</span>
                            <span>
                              ↓{formatBytes(container.network.rxBytes)} ↑{formatBytes(container.network.txBytes)}
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {/* --- Historial de pagos de hosting (solo lectura) --- */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2rem" }}>
            <h4 style={{ margin: 0 }}>Historial de pagos de hosting</h4>
            <button type="button" onClick={() => navigate(`/admin/agency-clients/${id}/hosting-payments/new`)} style={{ width: "auto" }}>
              Agregar pago
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Pagado el</th>
                <th>Cubre hasta</th>
                <th>Monto</th>
                <th>Notas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={5}>Sin pagos registrados.</td>
                </tr>
              ) : null}
              {payments.map((payment) => (
                <tr key={payment._id}>
                  <td>{formatDate(payment.paidAt)}</td>
                  <td>{formatDate(payment.coversUntil)}</td>
                  <td>{payment.amount ? formatCurrency(payment.amount) : "—"}</td>
                  <td>{payment.notes || "—"}</td>
                  <td>
                    <button type="button" className="btn-danger" onClick={() => handleDeletePayment(payment._id)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* --- Historial de deudas de diseño (solo lectura) --- */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2rem" }}>
            <h4 style={{ margin: 0 }}>Deudas de diseño</h4>
            <button type="button" onClick={() => navigate(`/admin/agency-clients/${id}/design-debts/new`)} style={{ width: "auto" }}>
              Agregar deuda
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Monto</th>
                <th>Pagado</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {debts.length === 0 ? (
                <tr>
                  <td colSpan={5}>Sin deudas registradas.</td>
                </tr>
              ) : null}
              {debts.map((debt) => (
                <tr key={debt._id}>
                  <td>{debt.description}</td>
                  <td>{formatCurrency(debt.amount)}</td>
                  <td>{formatCurrency(debt.amountPaid)}</td>
                  <td>
                    <span className={`badge badge-${debt.status === "paid" ? "green" : debt.status === "partial" ? "yellow" : "red"}`}>
                      {debt.status}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: "0.5rem", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                    {debt.status !== "paid" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/agency-clients/${id}/design-debts/${debt._id}/payment`)}
                          style={{ width: "auto" }}
                        >
                          Abonar
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => handleMarkDebtPaid(debt)} style={{ width: "auto" }}>
                          Marcar pagada
                        </button>
                      </>
                    ) : null}
                    <button type="button" className="btn-danger" onClick={() => handleDeleteDebt(debt._id)} style={{ width: "auto" }}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
};

export default AgencyClientDetail;
