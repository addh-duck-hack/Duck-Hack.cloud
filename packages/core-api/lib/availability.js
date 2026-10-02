// Disponibilidad de la agenda (Fase 2.3, Obsidian "Fase 2 - Citas"). Solo
// funciones puras: no tocan la base de datos. modules/appointments.js junta
// los datos (horario del negocio, festivos, especialista, citas y bloqueos)
// y aquí se calculan los horarios libres.
//
// Tiempos: las citas y bloqueos se guardan en UTC; los horarios ("10:00") y
// los días ("2026-10-15") son hora local de la tienda (`timezone`, IANA). La
// conversión usa Intl, sin librerías.
//
// Regla de un horario libre para una especialista en un día:
//   1. ventana = turnos del negocio ese día ∩ turnos de la especialista
//      (sin turnos del negocio configurados, cuenta solo el de ella; un
//      festivo cierra el día completo);
//   2. el servicio (duración total) cabe completo dentro de la ventana;
//   3. lo que ocupa la cita (duración + tiempo entre citas) no choca con
//      otras citas (que ocupan su duración + su tiempo entre citas) ni con
//      bloqueos;
//   4. empieza en múltiplo de `stepMin` contado desde las 00:00 locales, no
//      antes de `notBefore` ni después de `notAfter`.

const MINUTE = 60 * 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n) => String(n).padStart(2, "0");

// Partes de un instante en una zona: { year, month, day, hour, minute, weekday }.
const partsIn = (date, timezone) => {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const out = {};
  for (const { type, value } of fmt.formatToParts(date)) out[type] = value;
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: weekdays[out.weekday],
  };
};

// Diferencia (ms) entre la hora local de la zona y UTC en ese instante.
const offsetAt = (ms, timezone) => {
  const p = partsIn(new Date(ms), timezone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};

// "2026-10-15" + "10:30" en la zona → ms UTC. Dos pasadas para que un cambio
// de horario en medio no deje la hora corrida.
const localToUtc = (dateStr, timeStr, timezone) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - offsetAt(guess, timezone);
  utc = guess - offsetAt(utc, timezone);
  return utc;
};

// ms UTC → { date: "YYYY-MM-DD", time: "HH:MM", weekday } en la zona.
const utcToLocal = (ms, timezone) => {
  const p = partsIn(new Date(ms), timezone);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}`, weekday: p.weekday };
};

const isValidDate = (dateStr) => {
  if (!DATE_PATTERN.test(String(dateStr || ""))) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
};

// Día de la semana de una fecha de calendario (0 = domingo).
const weekdayOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();

// "2026-10-15" + n días.
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---- intervalos [start, end) en ms ----
const normalize = (intervals) => {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ start: i.start, end: i.end });
  }
  return out;
};

const intersect = (a, b) => {
  const out = [];
  for (const x of normalize(a)) {
    for (const y of normalize(b)) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (end > start) out.push({ start, end });
    }
  }
  return normalize(out);
};

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

// Turnos de un día ([{ day, open, close, closed? }]) → intervalos UTC.
const shiftsToIntervals = (shifts, dateStr, timezone) => {
  const day = weekdayOf(dateStr);
  return (shifts || [])
    .filter((s) => s.day === day && !s.closed && TIME_PATTERN.test(s.open || "") && TIME_PATTERN.test(s.close || "") && s.open < s.close)
    .map((s) => ({ start: localToUtc(dateStr, s.open, timezone), end: localToUtc(dateStr, s.close, timezone) }));
};

// Ventanas de trabajo de una especialista un día (ya cruzadas con el negocio).
const workingWindows = ({ dateStr, timezone, businessHours, holidays, weeklyHours }) => {
  if ((holidays || []).some((h) => h.date === dateStr)) return [];
  const own = shiftsToIntervals(weeklyHours, dateStr, timezone);
  if (!own.length) return [];
  // Sin horario del negocio configurado, no se restringe por negocio.
  if (!(businessHours || []).length) return normalize(own);
  return intersect(shiftsToIntervals(businessHours, dateStr, timezone), own);
};

// Horarios libres (ms UTC de inicio) de una especialista en un día.
//   durationMin: suma de los servicios; bufferMin: tiempo libre después.
//   busy: [{ start, end }] ms (citas con su buffer ya sumado, bloqueos).
const slotsForDay = ({ dateStr, timezone, businessHours, holidays, weeklyHours, durationMin, bufferMin = 0, stepMin, busy = [], notBefore = -Infinity, notAfter = Infinity }) => {
  const windows = workingWindows({ dateStr, timezone, businessHours, holidays, weeklyHours });
  if (!windows.length) return [];
  const duration = durationMin * MINUTE;
  const occupied = (durationMin + bufferMin) * MINUTE;
  const step = stepMin * MINUTE;
  const busyList = normalize(busy);
  const midnight = localToUtc(dateStr, "00:00", timezone);
  const slots = [];
  for (const w of windows) {
    // Primer múltiplo de `step` (desde la medianoche local) dentro de la ventana.
    let t = midnight + Math.ceil((w.start - midnight) / step) * step;
    for (; t + duration <= w.end; t += step) {
      if (t < notBefore || t > notAfter) continue;
      const candidate = { start: t, end: t + occupied };
      if (busyList.some((b) => overlaps(candidate, b))) continue;
      slots.push(t);
    }
  }
  return slots;
};

module.exports = {
  MINUTE,
  isValidDate,
  weekdayOf,
  addDays,
  localToUtc,
  utcToLocal,
  normalize,
  intersect,
  overlaps,
  workingWindows,
  slotsForDay,
};
