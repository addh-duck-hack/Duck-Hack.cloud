import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatDuration } from "./ServiceList";
import { APPOINTMENT_STATUS_LABELS, formatDateTime } from "../utils/schedule";
import PhoneInput from "./PhoneInput";

// Alta y detalle de una cita desde la agenda del panel
// (packages/core-api/modules/appointments.js, 2.4). Una cita puede llevar
// varios servicios, en el orden en que se hacen. Si el horario queda fuera
// del de la especialista (o sobre un bloqueo), o ella no tiene asignado algún
// servicio, el backend responde 409 y aquí se pregunta si guardar de todos
// modos (`force`). Empalmada con otra cita nunca se guarda.

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const pad = (n) => String(n).padStart(2, "0");
const dateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeInput = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const FORCEABLE = ["OUTSIDE_HOURS", "SPECIALIST_DOESNT_DO_SERVICE"];

// Siguientes estados que tiene sentido ofrecer desde cada uno.
const STATUS_ACTIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "no_show", "cancelled"],
  completed: ["confirmed"],
  no_show: ["confirmed"],
  cancelled: ["confirmed"],
};
const ACTION_LABELS = {
  confirmed: "Confirmar",
  completed: "Completada",
  no_show: "No asistió",
  cancelled: "Cancelar cita",
};

const AppointmentDialog = ({ appointment, initialStart, initialSpecialist, specialists, services, onClose, onSaved }) => {
  const isEditing = Boolean(appointment);
  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" });

  const start = appointment ? new Date(appointment.start) : initialStart || new Date();
  const [form, setForm] = useState(() => ({
    services: appointment ? appointment.services.map((s) => String(s.service)) : [],
    specialist: appointment ? String(appointment.specialist?._id || appointment.specialist) : initialSpecialist || specialists[0]?._id || "",
    date: dateInput(start),
    time: timeInput(start),
    customerName: appointment?.customerName || "",
    customerPhone: appointment?.customerPhone || "",
    customerEmail: appointment?.customerEmail || "",
    notes: appointment?.notes || "",
    staffNotes: appointment?.staffNotes || "",
    source: "phone",
    cancelReason: "",
  }));
  const [addService, setAddService] = useState("");
  // Aviso por correo a la clienta en este cambio (si tiene correo y los
  // correos están encendidos en Ajustes de agenda).
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const serviceById = useMemo(() => new Map(services.map((s) => [String(s._id), s])), [services]);
  const chosen = form.services.map((id) => serviceById.get(id) || appointment?.services.find((s) => String(s.service) === id)).filter(Boolean);
  const totalDuration = chosen.reduce((sum, s) => sum + s.durationMin, 0);
  const totalPrice = chosen.reduce((sum, s) => sum + s.price, 0);
  const specialist = specialists.find((s) => String(s._id) === String(form.specialist));
  const notDone = chosen.filter((s) => specialist && !(specialist.services || []).some((x) => String(x._id || x) === String(s._id || s.service)));

  const set = (field) => (event) => {
    setError("");
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const appendService = (id) => {
    if (!id) return;
    setForm((prev) => ({ ...prev, services: [...prev.services, id] }));
    setAddService("");
  };
  const removeService = (index) => setForm((prev) => ({ ...prev, services: prev.services.filter((_, i) => i !== index) }));
  const moveService = (index, delta) =>
    setForm((prev) => {
      const list = [...prev.services];
      const target = index + delta;
      if (target < 0 || target >= list.length) return prev;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...prev, services: list };
    });

  // Guarda; si el backend pide confirmación (fuera de horario, servicio no
  // asignado), pregunta y reintenta con force.
  const save = async (body, force = false) => {
    setIsSaving(true);
    setError("");
    try {
      const payload = { ...body, notifyCustomer, ...(force ? { force: true } : {}) };
      const { data } = isEditing
        ? await axios.put(`${baseUrl}/api/appointments/${appointment._id}`, payload, { headers: getAuthHeaders() })
        : await axios.post(`${baseUrl}/api/appointments`, payload, { headers: getAuthHeaders() });
      onSaved(data.appointment);
    } catch (err) {
      const apiError = err.response?.data?.error;
      if (!force && FORCEABLE.includes(apiError?.code) && window.confirm(apiError.message)) {
        await save(body, true);
        return;
      }
      setError(apiError?.message || "No fue posible guardar la cita.");
    } finally {
      setIsSaving(false);
    }
  };

  const startIso = () => {
    const [y, m, d] = form.date.split("-").map(Number);
    const [h, min] = form.time.split(":").map(Number);
    return new Date(y, m - 1, d, h, min).toISOString();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.services.length) {
      setError("Agrega al menos un servicio.");
      return;
    }
    const body = {
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerEmail: form.customerEmail,
      notes: form.notes,
      staffNotes: form.staffNotes,
    };
    if (!isEditing) {
      Object.assign(body, { services: form.services, specialist: form.specialist, start: startIso(), source: form.source });
    } else {
      // Solo lo que cambió: si no se mueve horario/servicios/especialista, el
      // backend no vuelve a revisar el lugar (y no pregunta por el horario).
      const original = appointment.services.map((sv) => String(sv.service));
      if (form.services.join() !== original.join()) body.services = form.services;
      if (String(form.specialist) !== String(appointment.specialist?._id || appointment.specialist)) body.specialist = form.specialist;
      if (startIso() !== new Date(appointment.start).toISOString()) body.start = startIso();
    }
    save(body);
  };

  const changeStatus = (status) => {
    if (status === "cancelled" && !window.confirm("¿Cancelar esta cita? El horario queda libre.")) return;
    save({ status, ...(status === "cancelled" ? { cancelReason: form.cancelReason } : {}) });
  };

  const isClosed = appointment && ["cancelled", "completed", "no_show"].includes(appointment.status);

  return createPortal(
    <div className="agenda-dialog-backdrop" onClick={onClose}>
      <div className="agenda-dialog" role="dialog" aria-modal="true" aria-labelledby="agenda-dialog-title" onClick={(e) => e.stopPropagation()}>
        <header className="agenda-dialog-head">
          <h3 id="agenda-dialog-title">
            {isEditing ? `Cita #${appointment.appointmentNumber}` : "Nueva cita"}
            {isEditing ? <span className={`agenda-status agenda-status--${appointment.status}`}>{APPOINTMENT_STATUS_LABELS[appointment.status]}</span> : null}
          </h3>
          <button type="button" className="agenda-dialog-close" onClick={onClose} aria-label="Cerrar">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </header>

        {isEditing ? (
          <p className="agenda-dialog-meta">
            {appointment.source === "web" ? "Agendada en el sitio" : appointment.source === "walk_in" ? "En mostrador" : "Por teléfono"} ·{" "}
            {formatDateTime(appointment.createdAt)}
            {appointment.cancelledAt ? ` · Cancelada por ${appointment.cancelledBy === "customer" ? "la clienta" : "el negocio"}${appointment.cancelReason ? `: ${appointment.cancelReason}` : ""}` : ""}
          </p>
        ) : null}

        {error ? <div className="auth-error">{error}</div> : null}

        {isEditing && STATUS_ACTIONS[appointment.status]?.length ? (
          <div className="agenda-status-actions">
            {STATUS_ACTIONS[appointment.status].map((status) => (
              <button
                key={status}
                type="button"
                className={status === "cancelled" ? "btn-secondary" : undefined}
                onClick={() => changeStatus(status)}
                disabled={isSaving}
              >
                {appointment.status === "cancelled" && status === "confirmed" ? "Reactivar" : ACTION_LABELS[status]}
              </button>
            ))}
            {appointment.status !== "cancelled" ? (
              <input type="text" value={form.cancelReason} onChange={set("cancelReason")} maxLength={300} placeholder="Motivo si la cancelas (opcional)" />
            ) : null}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="agenda-dialog-form">
          <fieldset disabled={isClosed}>
            <label>
              Servicios (en el orden en que se hacen)
              <ol className="agenda-services">
                {chosen.map((s, i) => (
                  <li key={`${form.services[i]}-${i}`}>
                    <span>
                      {s.name} <small>{formatDuration(s.durationMin)} · {formatMxn(s.price)}</small>
                    </span>
                    <span className="agenda-services-actions">
                      <button type="button" className="btn-secondary" onClick={() => moveService(i, -1)} disabled={i === 0} aria-label="Subir">
                        ↑
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => moveService(i, 1)} disabled={i === chosen.length - 1} aria-label="Bajar">
                        ↓
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => removeService(i)} aria-label={`Quitar ${s.name}`}>
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
              <select value={addService} onChange={(e) => appendService(e.target.value)} aria-label="Agregar servicio">
                <option value="">+ Agregar servicio…</option>
                {services
                  .filter((s) => s.isActive !== false)
                  .map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name} ({formatDuration(s.durationMin)})
                    </option>
                  ))}
              </select>
              {chosen.length ? (
                <small>
                  Total: {formatDuration(totalDuration)} · {formatMxn(totalPrice)}
                </small>
              ) : null}
            </label>

            <div className="agenda-grid">
              <label>
                Especialista
                <select value={form.specialist} onChange={set("specialist")} required>
                  {specialists.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                      {s.isActive === false ? " (inactiva)" : ""}
                    </option>
                  ))}
                </select>
                {notDone.length ? <small className="agenda-warn">No tiene asignado: {notDone.map((s) => s.name).join(", ")}</small> : null}
              </label>
              <label>
                Fecha
                <input type="date" value={form.date} onChange={set("date")} required />
              </label>
              <label>
                Hora
                <input type="time" value={form.time} onChange={set("time")} step="300" required />
              </label>
            </div>

            <div className="agenda-grid">
              <label>
                Clienta
                <input type="text" value={form.customerName} onChange={set("customerName")} maxLength={120} required />
              </label>
              <label>
                Teléfono
                <PhoneInput name="customerPhone" value={form.customerPhone} onChange={set("customerPhone")} />
              </label>
              <label>
                Correo (opcional)
                <input type="email" value={form.customerEmail} onChange={set("customerEmail")} maxLength={160} />
              </label>
            </div>

            {!isEditing ? (
              <label>
                Cómo llegó
                <select value={form.source} onChange={set("source")}>
                  <option value="phone">Por teléfono / WhatsApp</option>
                  <option value="walk_in">En mostrador</option>
                </select>
              </label>
            ) : null}

            <div className="agenda-grid agenda-grid--2">
              <label>
                Notas de la clienta
                <textarea value={form.notes} onChange={set("notes")} rows={2} maxLength={500} />
              </label>
              <label>
                Notas internas
                <textarea value={form.staffNotes} onChange={set("staffNotes")} rows={2} maxLength={1000} />
              </label>
            </div>
          </fieldset>

          {form.customerEmail ? (
            <label className="agenda-notify">
              <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} />
              Avisar a la clienta por correo
            </label>
          ) : null}

          <footer className="agenda-dialog-foot">
            {!isClosed ? (
              <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
                {isSaving ? "Guardando..." : isEditing ? "Guardar cambios" : "Agendar"}
              </button>
            ) : null}
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default AppointmentDialog;
