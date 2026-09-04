import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "../utils/orderStatusLabels";

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const formatDate = (value) => formatCalendarDate(value) || "—";

const OrderList = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const response = await axios.get(`${baseUrl}/api/orders`, { headers: getAuthHeaders(), params });
      setOrders(response.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar los pedidos.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Pedidos</h3>
        <button type="button" onClick={() => navigate("/admin/orders/new")} style={{ width: "auto" }}>
          Nuevo pedido
        </button>
      </div>
      <p>Incluye tanto los pedidos creados aquí como los del checkout público de la tienda.</p>

      {error ? <div className="auth-error">{error}</div> : null}

      <label style={{ maxWidth: 260 }}>
        Filtrar por estado
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s].label}
            </option>
          ))}
        </select>
      </label>

      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Fecha</th>
            <th>Cliente</th>
            <th>Artículos</th>
            <th>Pago</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && orders.length === 0 ? (
            <tr>
              <td colSpan={8}>Sin pedidos registrados.</td>
            </tr>
          ) : null}
          {orders.map((order) => {
            const statusInfo = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: "" };
            return (
              <tr key={order._id}>
                <td>{order.orderNumber ? `#${order.orderNumber}` : "—"}</td>
                <td>{formatDate(order.createdAt)}</td>
                <td>{order.customerName}</td>
                <td>{order.items?.length || 0}</td>
                <td>{PAYMENT_METHOD_LABELS[order.paymentMethod] || "—"}</td>
                <td>{formatMxn(order.total)}</td>
                <td>
                  <span className={`badge badge-${statusInfo.color}`}>{statusInfo.label}</span>
                </td>
                <td>
                  <button type="button" onClick={() => navigate(`/admin/orders/${order._id}`)}>
                    Ver
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

export default OrderList;
