// Badge de color por proximidad de una fecha (pago de hosting vencido/por
// vencer, dominio por caducar, etc.) — regla de presentación pura sobre "hoy",
// se calcula en el frontend para no acoplar el umbral de aviso al backend.
import { formatCalendarDate } from "./formatCalendarDate";

const WARNING_DAYS_DEFAULT = 15;

export const getDateStatusBadge = (date, { emptyLabel = "Sin fecha", warningDays = WARNING_DAYS_DEFAULT } = {}) => {
  if (!date) return { color: "red", label: emptyLabel };

  const target = new Date(date);
  const now = new Date();
  const warningThreshold = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);
  // Se guarda como medianoche UTC (viene de un <input type="date">): se
  // formatea en UTC para mostrar el mismo día que se capturó, ver formatCalendarDate.js.
  const label = formatCalendarDate(target);

  if (target < now) return { color: "red", label: `Vencido (${label})` };
  if (target <= warningThreshold) return { color: "yellow", label: `Por vencer (${label})` };
  return { color: "green", label: `Al día (${label})` };
};
