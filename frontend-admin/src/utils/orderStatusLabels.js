// Compartido entre OrderList.jsx y OrderDetail.jsx.
export const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

export const ORDER_STATUS_LABELS = {
  pending: { label: "Pendiente", color: "yellow" },
  confirmed: { label: "Confirmado", color: "blue" },
  processing: { label: "En proceso", color: "blue" },
  shipped: { label: "Enviado", color: "blue" },
  delivered: { label: "Entregado", color: "green" },
  cancelled: { label: "Cancelado", color: "red" },
};

// Checkout sin pasarela (ver packages/core-api/modules/orders.js#POST /public):
// el pedido siempre entra "pending" y la tienda confirma el pago/entrega a
// mano según el método que eligió el cliente. Los pedidos nuevos traen la
// copia del nombre del método (paymentMethodLabel); este mapa solo cubre los
// ids de pedidos anteriores.
export const PAYMENT_METHOD_LABELS = {
  transfer: "Transferencia / SPEI",
  pickup: "Pago en finca",
};

export const paymentLabelOf = (order) =>
  order?.paymentMethodLabel || PAYMENT_METHOD_LABELS[order?.paymentMethod] || order?.paymentMethod || "—";

export const deliveryLabelOf = (order) => {
  if (order?.deliveryMethod !== "pickup") return "Envío a domicilio";
  return order.pickupPoint?.name ? `Recoger en ${order.pickupPoint.name}` : "Recoger en tienda";
};
