import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";

// Bandeja de reseñas de producto (módulo "reviews" de los permisos,
// packages/core-api/modules/reviews.js). Toda reseña entra "Por revisar" y
// solo se publica al aprobarla; aprobar, rechazar o borrar una publicada
// recalcula el promedio del producto en el backend.

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
      const response = await axios.get(`${baseUrl}/api/reviews`, { headers: getAuthHeaders(), params: { status } });
      setReviews(response.data?.items || []);
      setCounts(response.data?.counts || {});
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar las reseñas.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar esta reseña? El cliente podrá calificar el producto otra vez.")) return;
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

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Reseñas</h3>
      <p>
        Calificaciones de clientes que recibieron el producto. Se publican en la tienda solo cuando las apruebas; el cliente puede
        editar la suya y vuelve a revisión.
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

      {error ? <div className="auth-error">{error}</div> : null}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
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
                  <td style={{ minWidth: 240 }}>
                    <Stars value={r.rating} />
                    {r.comment ? <p style={{ margin: "0.25rem 0 0", whiteSpace: "pre-line" }}>{r.comment}</p> : <small style={{ opacity: 0.75 }}> Sin comentario</small>}
                    {r.status === "rejected" && r.rejectionReason ? (
                      <small style={{ display: "block", marginTop: "0.25rem", opacity: 0.75 }}>Motivo: {r.rejectionReason}</small>
                    ) : null}
                  </td>
                  <td>
                    {r.customerName || "—"}
                    {r.customer?.email ? <small style={{ display: "block", opacity: 0.75 }}>{r.customer.email}</small> : null}
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
