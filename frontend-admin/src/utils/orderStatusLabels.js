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
// mano según el método que eligió el cliente.
export const PAYMENT_METHOD_LABELS = {
  transfer: "Transferencia / SPEI",
  pickup: "Pago en finca",
};
