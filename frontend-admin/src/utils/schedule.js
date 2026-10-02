// Días de la semana para horarios (0 = domingo … 6 = sábado, igual que el
// backend), en orden de lunes a domingo para mostrarlos.
export const WEEK_DAYS = [
  { day: 1, label: "Lunes" },
  { day: 2, label: "Martes" },
  { day: 3, label: "Miércoles" },
  { day: 4, label: "Jueves" },
  { day: 5, label: "Viernes" },
  { day: 6, label: "Sábado" },
  { day: 0, label: "Domingo" },
];

// Roles que administran la agenda (especialistas, ajustes, bloqueos de todo
// el negocio). Una collaborator con el módulo Citas solo ve lo suyo.
export const isAgendaManager = (role) => role === "super_admin" || role === "store_admin";

// Date → "AAAA-MM-DDTHH:MM" local, para <input type="datetime-local">.
export const toDateTimeInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatDateTime = (value) =>
  new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

export const APPOINTMENT_STATUS_LABELS = {
  pending: "Por confirmar",
  confirmed: "Confirmada",
  completed: "Completada",
  no_show: "No asistió",
  cancelled: "Cancelada",
};
