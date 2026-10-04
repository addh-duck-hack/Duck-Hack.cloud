import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";
import { ORDER_STATUS_LABELS, statusesFor, paymentLabelOf, deliveryLabelOf } from "../utils/orderStatusLabels";
import OrderPaymentProofs from "./OrderPaymentProofs";

const emptyShipment = { carrier: "", trackingNumber: "", trackingUrl: "" };
const shipmentFormOf = (order) => ({
  carrier: order?.shipment?.carrier || "",
  trackingNumber: order?.shipment?.trackingNumber || "",
  trackingUrl: order?.shipment?.trackingUrl || "",
});

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const formatDate = (value) => formatCalendarDate(value) || "—";

const OrderDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("");
  const [shipment, setShipment] = useState(emptyShipment);
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
      setShipment(shipmentFormOf(response.data));
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

  // Después de revisar o subir un comprobante: el backend ya devuelve el
  // pedido actualizado (puede haber cambiado de estado).
  const handleProofsChange = (updated, text) => {
    setOrder((prev) => ({ ...updated, customer: prev?.customer }));
    setStatus(updated.status);
    setError("");
    setMessage(text);
  };

  const handleUpdateStatus = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = { status };
      if (order.deliveryMethod !== "pickup") payload.shipment = shipment;
      await axios.put(`${baseUrl}/api/orders/${id}`, payload, {
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      });
      setMessage("Pedido actualizado.");
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
        <h3 style={{ margin: 0 }}>
          Pedido {order.orderNumber ? `#${order.orderNumber} ` : ""}de {order.customerName}
        </h3>
        <span className={`badge badge-${statusInfo.color}`}>{statusInfo.label}</span>
      </div>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <div style={{ margin: "1rem 0" }}>
        <p>Fecha: {formatDate(order.createdAt)}</p>
        <p>Correo: {order.customerEmail}</p>
        {order.customerPhone ? <p>Teléfono: {order.customerPhone}</p> : null}
        <p>
          Cliente:{" "}
          {order.customer ? (
            <span className="badge badge-blue">
              {order.customer.name || order.customer.email || "Usuario registrado"}
            </span>
          ) : (
            "Invitado"
          )}
        </p>
        <p>Entrega: {deliveryLabelOf(order)}</p>
        {order.deliveryMethod === "pickup" && order.pickupPoint?.name ? (
          <p style={{ marginTop: 0, paddingLeft: "1rem" }}>
            {order.pickupPoint.address}
            {order.pickupPoint.schedule ? (
              <>
                <br />
                Horario: {order.pickupPoint.schedule}
              </>
            ) : null}
          </p>
        ) : null}
        {order.readyForPickupAt || order.pickedUpAt ? (
          <p style={{ marginTop: 0, paddingLeft: "1rem" }}>
            {order.readyForPickupAt ? `Listo para recoger: ${formatDate(order.readyForPickupAt)}` : ""}
            {order.readyForPickupAt && order.pickedUpAt ? " · " : ""}
            {order.pickedUpAt ? `Recogido: ${formatDate(order.pickedUpAt)}` : ""}
          </p>
        ) : null}
        <p>Pago: {paymentLabelOf(order)}</p>
        {order.shippingAddress ? (
          <div>
            <p style={{ marginBottom: "0.25rem" }}>Dirección de envío:</p>
            <p style={{ marginTop: 0, paddingLeft: "1rem" }}>
              {order.shippingAddress.recipientName} · {order.shippingAddress.phone}
              <br />
              {order.shippingAddress.street} {order.shippingAddress.exteriorNumber}
              {order.shippingAddress.interiorNumber ? `, Int. ${order.shippingAddress.interiorNumber}` : ""}
              <br />
              {order.shippingAddress.neighborhood}, {order.shippingAddress.city}, {order.shippingAddress.state}
              <br />
              C.P. {order.shippingAddress.zipCode}
            </p>
          </div>
        ) : null}
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
              <td>
                {item.productName}
                {item.variantLabel ? <small style={{ display: "block", opacity: 0.75 }}>{item.variantLabel}</small> : null}
              </td>
              <td>{item.quantity}</td>
              <td>{formatMxn(item.unitPrice)}</td>
              <td>{formatMxn(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {order.discount?.code ? (
        <p style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          Cupón <strong>{order.discount.code}</strong>
          {order.discount.type === "free_shipping" ? " (envío gratis)" : `: −${formatMxn(order.discount.amount)}`}
        </p>
      ) : null}
      {order.loyalty?.redeemed > 0 ? (
        <p style={{ marginTop: "0.75rem", marginBottom: 0 }}>Puntos usados: −{formatMxn(order.loyalty.redeemed)}</p>
      ) : null}
      {order.shippingCost > 0 ? (
        <p style={{ marginTop: "0.75rem", marginBottom: 0 }}>Envío: {formatMxn(order.shippingCost)}</p>
      ) : null}
      <p style={{ marginTop: "0.75rem" }}>
        <strong>Total: {formatMxn(order.total)}</strong>
      </p>

      {order.loyalty?.earnedCounted && order.loyalty.earned > 0 ? (
        <p style={{ marginTop: 0 }}>
          <small>El cliente ganó {formatMxn(order.loyalty.earned)} en puntos con este pedido (se retiran si se cancela).</small>
        </p>
      ) : null}

      <OrderPaymentProofs order={order} onChange={handleProofsChange} />

      <h4 style={{ marginTop: "1.5rem" }}>{order.deliveryMethod === "pickup" ? "Cambiar estado" : "Estado y envío"}</h4>
      <form onSubmit={handleUpdateStatus} style={{ maxWidth: 700, margin: 0 }}>
        <label>
          Estado
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {/* Solo los estados de su entrega (recoger: "Listo para recoger" / "Recogido"). */}
            {statusesFor(order.deliveryMethod).map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s].label}
              </option>
            ))}
          </select>
          <small>
            {order.deliveryMethod === "pickup"
              ? "Al cambiarlo a Pagado, Listo para recoger, Recogido o Cancelado se le avisa al cliente por correo"
              : "Al cambiarlo a Pagado, Enviado, Entregado o Cancelado se le avisa al cliente por correo"}{" "}
            (se puede apagar en Configurar tienda → Ventas y pagos).
          </small>
        </label>

        {order.deliveryMethod !== "pickup" ? (
          <>
            <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label>
                Paquetería
                <input
                  type="text"
                  value={shipment.carrier}
                  maxLength={80}
                  placeholder="Ej. Estafeta, DHL, FedEx"
                  onChange={(e) => setShipment((prev) => ({ ...prev, carrier: e.target.value }))}
                />
              </label>
              <label>
                Número de guía
                <input
                  type="text"
                  value={shipment.trackingNumber}
                  maxLength={120}
                  onChange={(e) => setShipment((prev) => ({ ...prev, trackingNumber: e.target.value }))}
                />
              </label>
            </div>
            <label>
              Enlace de rastreo (opcional)
              <input
                type="url"
                value={shipment.trackingUrl}
                maxLength={500}
                placeholder="https://..."
                onChange={(e) => setShipment((prev) => ({ ...prev, trackingUrl: e.target.value }))}
              />
              <small>Si lo llenas, el correo de "va en camino" lleva un botón para rastrear.</small>
            </label>
            {order.shipment?.shippedAt || order.shipment?.deliveredAt ? (
              <p style={{ marginTop: 0 }}>
                {order.shipment.shippedAt ? `Enviado: ${formatDate(order.shipment.shippedAt)}` : ""}
                {order.shipment.shippedAt && order.shipment.deliveredAt ? " · " : ""}
                {order.shipment.deliveredAt ? `Entregado: ${formatDate(order.shipment.deliveredAt)}` : ""}
              </p>
            ) : null}
          </>
        ) : null}

        <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
          {isSaving ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </section>
  );
};

export default OrderDetail;
