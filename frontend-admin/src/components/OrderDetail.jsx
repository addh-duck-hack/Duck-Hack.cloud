import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "../utils/orderStatusLabels";

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const formatDate = (value) => formatCalendarDate(value) || "—";

const OrderDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadOrder = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/orders/${id}`, { headers: getAuthHeaders() });
      setOrder(response.data);
      setStatus(response.data?.status || "");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar el pedido.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleUpdateStatus = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      await axios.put(
        `${baseUrl}/api/orders/${id}`,
        { status },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setMessage("Estado actualizado.");
      await loadOrder();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible actualizar el estado.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <p>Cargando...</p>;
  if (!order) return <p>{error || "Pedido no encontrado."}</p>;

  const statusInfo = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: "" };

  return (
    <section>
      <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => navigate("/admin/orders")}>
        ← Volver
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginTop: "1rem" }}>
        <h3 style={{ margin: 0 }}>Pedido de {order.customerName}</h3>
        <span className={`badge badge-${statusInfo.color}`}>{statusInfo.label}</span>
      </div>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <div style={{ margin: "1rem 0" }}>
        <p>Fecha: {formatDate(order.createdAt)}</p>
        <p>Correo: {order.customerEmail}</p>
        {order.customerPhone ? <p>Teléfono: {order.customerPhone}</p> : null}
        {order.shippingAddress ? <p>Dirección de envío: {order.shippingAddress}</p> : null}
        {order.notes ? <p>Notas: {order.notes}</p> : null}
      </div>

      <h4>Artículos</h4>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Precio unitario</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => (
            <tr key={index}>
              <td>{item.productName}</td>
              <td>{item.quantity}</td>
              <td>{formatMxn(item.unitPrice)}</td>
              <td>{formatMxn(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: "0.75rem" }}>
        <strong>Total: {formatMxn(order.total)}</strong>
      </p>

      <h4 style={{ marginTop: "1.5rem" }}>Cambiar estado</h4>
      <form onSubmit={handleUpdateStatus} style={{ maxWidth: 400, margin: 0 }}>
        <label>
          Estado
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s].label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
          {isSaving ? "Guardando..." : "Actualizar estado"}
        </button>
      </form>
    </section>
  );
};

export default OrderDetail;
