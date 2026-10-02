// Compartido entre OrderList.jsx y OrderDetail.jsx.
// Mismo orden y claves que ORDER_STATUSES en packages/core-api/modules/orders.js.
// payment_review = hay un comprobante de pago por revisar (OrderDetail).
// shipped/delivered son solo de envío a domicilio y ready_for_pickup/picked_up
// solo de recoger en tienda (statusesFor; el backend rechaza la mezcla).
export const ORDER_STATUSES = [
  "pending", "payment_review", "confirmed", "processing",
  "shipped", "delivered", "ready_for_pickup", "picked_up", "cancelled",
];

const SHIPPING_ONLY = ["shipped", "delivered"];
const PICKUP_ONLY = ["ready_for_pickup", "picked_up"];
export const statusesFor = (deliveryMethod) => {
  const exclude = deliveryMethod === "pickup" ? SHIPPING_ONLY : PICKUP_ONLY;
  return ORDER_STATUSES.filter((s) => !exclude.includes(s));
};

export const ORDER_STATUS_LABELS = {
  pending: { label: "Pendiente de pago", color: "yellow" },
  payment_review: { label: "Comprobante en revisión", color: "yellow" },
  confirmed: { label: "Pagado", color: "blue" },
  processing: { label: "En proceso", color: "blue" },
  shipped: { label: "Enviado", color: "blue" },
  delivered: { label: "Entregado", color: "green" },
  ready_for_pickup: { label: "Listo para recoger", color: "blue" },
  picked_up: { label: "Recogido", color: "green" },
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
