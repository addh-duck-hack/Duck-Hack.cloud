// src/utils/format.js — dinero, fechas y textos que se repiten en todo el sitio.
import { getApiBaseUrl } from './apiClient';

// Zona horaria del negocio (las citas se muestran a la hora de la tienda, no
// la del navegador). La agenda manda la suya en cada cita / disponibilidad.
export const DEFAULT_TZ = 'America/Mexico_City';

// Enteros sin centavos ($189); con centavos, siempre dos ($37.80).
export const money = (n) => {
  const value = Math.abs(Number(n || 0));
  const cents = Math.round(value * 100) % 100 !== 0;
  return `${Number(n) < 0 ? '−' : ''}$${value.toLocaleString('es-MX', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
};

export const fmtDate = (value, tz = DEFAULT_TZ) =>
  value ? new Date(value).toLocaleDateString('es-MX', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

export const fmtShortDate = (value, tz = DEFAULT_TZ) =>
  value ? new Date(value).toLocaleDateString('es-MX', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }) : '';

export const fmtTime = (value, tz = DEFAULT_TZ) =>
  value ? new Date(value).toLocaleTimeString('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit' }) : '';

export const fmtDuration = (min) => {
  const m = Number(min) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
};

// Fecha YYYY-MM-DD "de hoy + n días" en la zona del negocio (para pedir
// disponibilidad por días).
export const isoDay = (offsetDays = 0, tz = DEFAULT_TZ) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: tz });
};

export const dayLabel = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return {
    weekday: d.toLocaleDateString('es-MX', { weekday: 'short' }),
    day: d.getDate(),
    month: d.toLocaleDateString('es-MX', { month: 'short' }),
  };
};

// Rutas relativas que guarda el backend (uploads/…) → URL absoluta.
export const mediaUrl = (path) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${getApiBaseUrl()}/${String(path).replace(/^\/+/, '')}`;
};

export const folio = (prefix, n) => `${prefix}-${String(n ?? '').padStart(5, '0')}`;

export const ORDER_STATUS = {
  pending: 'Pendiente de pago',
  payment_review: 'Revisando tu pago',
  confirmed: 'Pagado',
  processing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  ready_for_pickup: 'Listo para recoger',
  picked_up: 'Recogido',
  cancelled: 'Cancelado',
};

export const APPOINTMENT_STATUS = {
  pending: 'Por confirmar',
  confirmed: 'Confirmada',
  completed: 'Completada',
  no_show: 'No asistió',
  cancelled: 'Cancelada',
};

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sin respuesta del backend (red caída, CORS) fetch lanza TypeError sin status.
export const errorText = (err, fallback = 'Algo salió mal. Intenta de nuevo.') =>
  err?.status ? err.message || fallback : err instanceof TypeError ? 'No pudimos conectar con el servidor. Revisa tu conexión.' : err?.message || fallback;
