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
