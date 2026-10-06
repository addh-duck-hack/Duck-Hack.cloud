import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";
import { formatDateTime } from "../utils/schedule";
import { usePermissions } from "../hooks/usePermissions";
import Alert from "./Alert";

// Bandeja de reseñas (módulo "reviews" de los permisos,
// packages/core-api/modules/reviews.js), de producto y de cita (pestañas). Toda
// reseña entra "Por revisar" y solo se publica al aprobarla; en las de
// producto, aprobar, rechazar o borrar una publicada recalcula el promedio
// del producto en el backend. Una aprobada se puede "Publicar como
// testimonio" (se copia a los testimonios de "Configurar tienda").

const KINDS = [
  { kind: "product", label: "Productos" },
  { kind: "appointment", label: "Citas" },
];

const TABS = [
  { status: "pending", label: "Por revisar" },
  { status: "approved", label: "Publicadas" },
  { status: "rejected", label: "Rechazadas" },
];

const Stars = ({ value }) => (
  <span aria-label={`${value} de 5 estrellas`} style={{ color: "#d89b00", letterSpacing: 1, whiteSpace: "nowrap" }}>
    {"★".repeat(value)}
    <span style={{ opacity: 0.3 }}>{"★".repeat(5 - value)}</span>
  </span>
);

const ReviewList = () => {
  const { can } = usePermissions();
  const [kind, setKind] = useState("product");
  const [pendingByKind, setPendingByKind] = useState({});
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("pending");
  const [reviews, setReviews] = useState([]);
  const [counts, setCounts] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  // Reseña con el campo "motivo de rechazo" abierto.
  const [rejecting, setRejecting] = useState({ id: "", reason: "" });

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadReviews = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/reviews`, { headers: getAuthHeaders(), params: { kind, status } });
      setReviews(response.data?.items || []);
      setCounts(response.data?.counts || {});
      setPendingByKind(response.data?.pendingByKind || {});
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar las reseñas.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, status]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const moderate = async (id, nextStatus, rejectionReason = "") => {
    setBusyId(id);
    setError("");
    try {
      await axios.put(
        `${baseUrl}/api/reviews/${id}`,
        { status: nextStatus, rejectionReason },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setRejecting({ id: "", reason: "" });
      await loadReviews();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar el cambio.");
    } finally {
      setBusyId("");
    }
  };

  const publishTestimonial = async (id) => {
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      const { data } = await axios.post(`${baseUrl}/api/reviews/${id}/testimonial`, {}, { headers: getAuthHeaders() });
      setMessage(data.message || "Publicada en los testimonios.");
      await loadReviews();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible publicarla como testimonio.");
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = async (id) => {
    const again = kind === "appointment" ? "La clienta podrá calificar la cita otra vez." : "El cliente podrá calificar el producto otra vez.";
    if (!window.confirm(`¿Eliminar esta reseña? ${again}`)) return;
    setBusyId(id);
    setError("");
    try {
      await axios.delete(`${baseUrl}/api/reviews/${id}`, { headers: getAuthHeaders() });
      await loadReviews();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar la reseña.");
    } finally {
      setBusyId("");
    }
  };

  // Las de cita solo tienen sentido con la agenda (o si ya hay alguna).
  const showKinds = can("appointments") || kind === "appointment" || pendingByKind.appointment > 0;

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Reseñas</h3>
      {showKinds ? (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className={kind === k.kind ? undefined : "btn-secondary"}
              onClick={() => {
                setKind(k.kind);
                setMessage("");
              }}
              style={{ width: "auto" }}
            >
              {k.label}
              {pendingByKind[k.kind] ? ` · ${pendingByKind[k.kind]} por revisar` : ""}
            </button>
          ))}
        </div>
      ) : null}
      <p>
        {kind === "appointment"
          ? "Calificaciones de clientas después de su cita (les llega un correo cuando la cita se marca como completada). Apruébalas para guardarlas; las que te gusten puedes publicarlas como testimonio en el sitio."
          : "Calificaciones de clientes que recibieron el producto. Se publican en la tienda solo cuando las apruebas; el cliente puede editar la suya y vuelve a revisión."}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {TABS.map((tab) => (
          <button
            key={tab.status}
            type="button"
            className={status === tab.status ? undefined : "btn-secondary"}
            onClick={() => setStatus(tab.status)}
            style={{ width: "auto" }}
          >
            {tab.label} ({counts[tab.status] ?? 0})
          </button>
        ))}
      </div>

      {error ? <Alert type="error">{error}</Alert> : null}
      {message ? <Alert type="success">{message}</Alert> : null}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>{kind === "appointment" ? "Cita" : "Producto"}</th>
              <th>Calificación</th>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5}>Cargando...</td>
              </tr>
            ) : null}
            {!isLoading && reviews.length === 0 ? (
              <tr>
                <td colSpan={5}>Sin reseñas en esta bandeja.</td>
              </tr>
            ) : null}
            {!isLoading &&
              reviews.map((r) => (
                <tr key={r._id}>
                  {kind === "appointment" ? (
                    <td style={{ minWidth: 180 }}>
                      {(r.appointmentInfo?.services || []).join(" + ") || "—"}
                      <small style={{ display: "block", opacity: 0.75 }}>
                        {r.appointmentInfo?.specialistName ? `Con ${r.appointmentInfo.specialistName}` : ""}
                        {r.appointmentInfo?.appointmentNumber ? ` · Cita #${r.appointmentInfo.appointmentNumber}` : ""}
                      </small>
                      {r.appointmentInfo?.start ? <small style={{ display: "block", opacity: 0.75 }}>{formatDateTime(r.appointmentInfo.start)}</small> : null}
                    </td>
                  ) : (
                  <td style={{ minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {r.product?.image ? (
                        <img
                          src={`${baseUrl}/${r.product.image}`}
                          alt=""
                          style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }}
                        />
                      ) : null}
                      <span>{r.product?.name || "Producto eliminado"}</span>
                    </div>
                  </td>
                  )}
                  <td style={{ minWidth: 240 }}>
                    <Stars value={r.rating} />
                    {r.comment ? <p style={{ margin: "0.25rem 0 0", whiteSpace: "pre-line" }}>{r.comment}</p> : <small style={{ opacity: 0.75 }}> Sin comentario</small>}
                    {r.status === "rejected" && r.rejectionReason ? (
                      <small style={{ display: "block", marginTop: "0.25rem", opacity: 0.75 }}>Motivo: {r.rejectionReason}</small>
                    ) : null}
                  </td>
                  <td>
                    {r.customerName || "—"}
                    {r.customer?.email || r.customerEmail ? (
                      <small style={{ display: "block", opacity: 0.75 }}>{r.customer?.email || r.customerEmail}</small>
                    ) : null}
                    {kind === "appointment" && !r.customer ? <small style={{ display: "block", opacity: 0.75 }}>Invitada</small> : null}
                    {r.order?.orderNumber ? <small style={{ display: "block", opacity: 0.75 }}>Pedido #{r.order.orderNumber}</small> : null}
                  </td>
                  <td>{formatCalendarDate(r.updatedAt || r.createdAt)}</td>
                  <td>
                    {rejecting.id === r._id ? (
                      <div style={{ display: "grid", gap: "0.5rem", minWidth: 220 }}>
                        <input
                          type="text"
                          value={rejecting.reason}
                          onChange={(e) => setRejecting({ id: r._id, reason: e.target.value })}
                          maxLength={300}
                          placeholder="Motivo (opcional, lo ve el cliente)"
                        />
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button type="button" onClick={() => moderate(r._id, "rejected", rejecting.reason)} disabled={busyId === r._id}>
                            Rechazar
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => setRejecting({ id: "", reason: "" })}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {r.status !== "approved" ? (
                          <button type="button" onClick={() => moderate(r._id, "approved")} disabled={busyId === r._id}>
                            {r.status === "rejected" ? "Publicar" : "Aprobar"}
                          </button>
                        ) : null}
                        {r.status !== "rejected" ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setRejecting({ id: r._id, reason: "" })}
                            disabled={busyId === r._id}
                          >
                            {r.status === "approved" ? "Despublicar" : "Rechazar"}
                          </button>
                        ) : null}
                        {r.status === "approved" ? (
                          r.isTestimonial ? (
                            <span className="badge badge-green" style={{ alignSelf: "center" }}>
                              En testimonios
                            </span>
                          ) : (
                            <button type="button" className="btn-secondary" onClick={() => publishTestimonial(r._id)} disabled={busyId === r._id}>
                              Publicar como testimonio
                            </button>
                          )
                        ) : null}
                        <button type="button" className="btn-secondary" onClick={() => handleDelete(r._id)} disabled={busyId === r._id}>
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default ReviewList;
