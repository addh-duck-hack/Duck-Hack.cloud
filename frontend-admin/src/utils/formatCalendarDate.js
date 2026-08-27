// Los campos de "solo fecha" (paidAt, coversUntil, domainExpiresAt,
// invoicedAt, issuedAt...) llegan de un <input type="date"> como "YYYY-MM-DD"
// y se guardan en Mongo como medianoche UTC (new Date("2026-04-05") === UTC
// medianoche, por spec de ISO 8601). Formatearlos con la zona horaria LOCAL
// del navegador (el comportamiento por default de toLocaleDateString) los
// recorre un día hacia atrás en cualquier huso horario detrás de UTC — todo
// México incluido. Se formatea siempre en UTC para que el día mostrado sea
// el mismo que el capturado, sin importar la zona horaria del navegador.
export const formatCalendarDate = (value, locale = "es-MX") => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, { timeZone: "UTC" });
};
