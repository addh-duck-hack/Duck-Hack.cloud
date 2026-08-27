// Badge de color por proximidad de una fecha (pago de hosting vencido/por
// vencer, dominio por caducar, etc.) — regla de presentación pura sobre "hoy",
// se calcula en el frontend para no acoplar el umbral de aviso al backend.
const WARNING_DAYS_DEFAULT = 15;

export const getDateStatusBadge = (date, { emptyLabel = "Sin fecha", warningDays = WARNING_DAYS_DEFAULT } = {}) => {
  if (!date) return { color: "red", label: emptyLabel };

  const target = new Date(date);
  const now = new Date();
  const warningThreshold = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);

  if (target < now) return { color: "red", label: `Vencido (${target.toLocaleDateString()})` };
  if (target <= warningThreshold) return { color: "yellow", label: `Por vencer (${target.toLocaleDateString()})` };
  return { color: "green", label: `Al día (${target.toLocaleDateString()})` };
};
