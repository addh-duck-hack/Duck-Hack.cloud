// Archivo de calendario (.ics, RFC 5545) y enlace "Agregar a Google
// Calendar" para los correos de citas (Fase 2.5, modules/appointments.js).
// Sin dependencias: un VEVENT en UTC con UID estable por cita y SEQUENCE que
// sube con cada cambio, para que Apple Calendar / Outlook actualicen o quiten
// el evento en lugar de duplicarlo.

const pad = (n) => String(n).padStart(2, "0");

// Date → 20261015T160000Z
const icsDate = (value) => {
  const d = new Date(value);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};

// Texto de una propiedad: \ ; , y saltos de línea se escapan.
const escapeText = (value = "") =>
  String(value).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Líneas de máximo 75 octetos; las siguientes empiezan con un espacio. Corta
// por caracteres completos (no parte un acento en dos).
const fold = (line) => {
  const out = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
};

// { uid, sequence, start, end, summary, description, location, url,
//   organizerName, method: "PUBLISH" | "CANCEL" } → texto del .ics.
const buildIcs = ({ uid, sequence = 0, start, end, summary, description, location, url, organizerName, method = "PUBLISH" }) => {
  const cancelled = method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Duck-Hack Cloud//${escapeText(organizerName || "Citas")}//ES`,
    "CALSCALE:GREGORIAN",
    `METHOD:${cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    location ? `LOCATION:${escapeText(location)}` : null,
    url ? `URL:${url}` : null,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    // Recordatorio 1 hora antes en el calendario de la clienta.
    ...(cancelled ? [] : ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(summary)}`, "TRIGGER:-PT1H", "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return `${lines.map(fold).join("\r\n")}\r\n`;
};

// Enlace que abre Google Calendar con el evento ya llenado.
const googleCalendarUrl = ({ start, end, summary, description, location }) => {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: summary || "",
    dates: `${icsDate(start)}/${icsDate(end)}`,
  });
  if (description) params.set("details", description);
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

module.exports = { buildIcs, googleCalendarUrl, icsDate, escapeText, fold };
