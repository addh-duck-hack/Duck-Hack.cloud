// Etiquetas y helpers compartidos por Mayoreo (Wholesale*.jsx) y Contabilidad
// de la tienda (StoreFinance*.jsx, Supplier*.jsx, Purchase*.jsx). Los valores
// son los de packages/core-api/modules/wholesale.js y storeAccounting.js.
import { getApiBaseUrl } from "./apiBaseUrl";
import { formatCalendarDate } from "./formatCalendarDate";

export { formatMxn } from "./accountingLabels";

export const PAYMENT_METHOD_LABELS = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
};

export const SALE_STATUS = {
  draft: { label: "Borrador", color: "" },
  delivered: { label: "Entregada", color: "green" },
  cancelled: { label: "Cancelada", color: "red" },
};

export const PAYMENT_STATUS = {
  pending: { label: "Sin pagar", color: "red" },
  partial: { label: "Abono parcial", color: "yellow" },
  paid: { label: "Pagada", color: "green" },
};

export const PURCHASE_STATUS = {
  draft: { label: "Borrador", color: "" },
  received: { label: "Recibida", color: "green" },
  cancelled: { label: "Cancelada", color: "red" },
};

export const MOVEMENT_REASON_LABELS = {
  initial: "Alta de inventario",
  manual_adjust: "Ajuste manual",
  order: "Pedido",
  order_release: "Pedido regresado",
  wholesale_sale: "Venta de mayoreo",
  wholesale_cancel: "Mayoreo cancelado",
  purchase: "Compra recibida",
  purchase_cancel: "Compra cancelada",
};

export const MONTH_LABELS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export const formatDate = (value) => formatCalendarDate(value) || "—";

// AAAA-MM-DD de hoy en la zona del navegador (para inputs type="date").
export const todayInput = () => new Date().toLocaleDateString("en-CA");

export const apiUrl = (path) => `${getApiBaseUrl()}${path}`;
export const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
export const jsonHeaders = () => ({ ...authHeaders(), "Content-Type": "application/json" });
export const errorMessage = (err, fallback) => err?.response?.data?.error?.message || fallback;

export const Badge = ({ map, value }) => {
  const entry = map[value] || { label: value, color: "" };
  return <span className={`badge${entry.color ? ` badge-${entry.color}` : ""}`}>{entry.label}</span>;
};
