// src/utils/storeLocation.js
//
// Ubicación, horario y días festivos de la tienda (Configurar tienda →
// Contacto y horario: StoreConfig.location / businessHours / holidays). Sin
// UI; lo usa la sección "Visítanos" de pages/ContactUs.jsx.

// Lunes primero, como se lee en México; `day` sigue la convención de JS
// (0 = domingo), igual que el backend.
const WEEK = [
  { day: 1, label: 'Lunes' },
  { day: 2, label: 'Martes' },
  { day: 3, label: 'Miércoles' },
  { day: 4, label: 'Jueves' },
  { day: 5, label: 'Viernes' },
  { day: 6, label: 'Sábado' },
  { day: 0, label: 'Domingo' },
];

// Qué buscar en Google Maps: las coordenadas si las hay (más exacto), si no
// la dirección. "" si no hay ninguna.
const mapsQuery = (location) => {
  if (location?.lat != null && location?.lng != null) return `${location.lat},${location.lng}`;
  return String(location?.address || '').trim();
};

// Mapa incrustado de Google (sin API key). "" si no hay qué mostrar.
export const mapEmbedSrc = (location) => {
  const q = mapsQuery(location);
  return q ? `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed` : '';
};

// "Cómo llegar": el enlace que capturó el admin o, si no, las indicaciones de
// Google Maps hacia la ubicación.
export const directionsHref = (location) => {
  if (/^https?:\/\//i.test(location?.mapsUrl || '')) return location.mapsUrl;
  const q = mapsQuery(location);
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : '';
};

// Horario por día, de lunes a domingo: [{ day, label, shifts: ["10:00–14:00"],
// closed, isToday }]. [] si la tienda no capturó horario (así la sección no
// muestra una semana entera de "Cerrado").
export const weeklyHours = (businessHours, today = new Date()) => {
  const rows = Array.isArray(businessHours) ? businessHours : [];
  if (rows.length === 0) return [];
  return WEEK.map(({ day, label }) => {
    const shifts = rows
      .filter((r) => r.day === day && !r.closed && r.open && r.close)
      .sort((a, b) => a.open.localeCompare(b.open))
      .map((r) => `${r.open}–${r.close}`);
    return { day, label, shifts, closed: shifts.length === 0, isToday: today.getDay() === day };
  });
};

// Próximos días festivos (de hoy en adelante), los más cercanos primero.
// `date` viene como "AAAA-MM-DD" (día de calendario, sin zona horaria).
export const upcomingHolidays = (holidays, limit = 5, today = new Date()) => {
  const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  return (Array.isArray(holidays) ? holidays : [])
    .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h?.date || '') && h.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit)
    .map((h) => {
      const [y, m, d] = h.date.split('-').map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      return { date: h.date, label: label.charAt(0).toUpperCase() + label.slice(1), reason: h.label || '' };
    });
};
