import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatDuration } from "./ServiceList";
import { APPOINTMENT_STATUS_LABELS, formatDateTime } from "../utils/schedule";
import PhoneInput from "./PhoneInput";
import OrderPaymentProofs from "./OrderPaymentProofs";
import { usePermissions } from "../hooks/usePermissions";
import "./AppointmentDialog.css";

// Alta y detalle de una cita desde la agenda del panel
// (packages/core-api/modules/appointments.js, 2.4). Una cita puede llevar
// varios servicios, en el orden en que se hacen. Si el horario queda fuera
// del de la especialista (o sobre un bloqueo), o ella no tiene asignado algún
// servicio, el backend responde 409 y aquí se pregunta si guardar de todos
// modos (`force`). Empalmada con otra cita nunca se guarda.
//
// Dos formas: modal (alta desde un hueco de la agenda) o, con `asPage`, el
// cuerpo de la vista de la cita (AppointmentDetail.jsx, /admin/appointments/:id).

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const pad = (n) => String(n).padStart(2, "0");
const dateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeInput = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const FORCEABLE = ["OUTSIDE_HOURS", "SPECIALIST_DOESNT_DO_SERVICE"];

// Siguientes estados que tiene sentido ofrecer desde cada uno. Desde
// "esperando anticipo", confirmar = el negocio ya recibió el anticipo por otro
// medio (efectivo, otra cuenta); lo normal es aprobar el comprobante abajo.
const STATUS_ACTIONS = {
  pending_deposit: ["confirmed", "cancelled"],
  deposit_review: ["confirmed", "cancelled"],
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

// Cobrar (parte de) la cita con una tarjeta de regalo (módulo giftCards):
// buscar el código, ver el saldo y canjear ligado a la cita.
const GiftCardRedeem = ({ appointment, onDone }) => {
  const baseUrl = getApiBaseUrl();
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  const [code, setCode] = useState("");
  const [card, setCard] = useState(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const lookup = async () => {
    setError("");
    setCard(null);
    try {
      const { data } = await axios.get(`${baseUrl}/api/gift-cards/lookup`, { headers, params: { code } });
      if (data.status !== "active") {
        setError(data.status === "used" ? "Esa tarjeta ya no tiene saldo." : data.status === "expired" ? "Esa tarjeta ya venció." : "Esa tarjeta no está activa.");
        return;
      }
      setCard(data);
      setAmount(String(Math.min(data.balance, appointment.total)));
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible consultar la tarjeta.");
    }
  };

  const redeem = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await axios.post(
        `${baseUrl}/api/gift-cards/redeem`,
        { code: card.code, amount: Number(amount), appointment: appointment._id, note: `Cita #${appointment.appointmentNumber}` },
        { headers }
      );
      setCard(null);
      setCode("");
      onDone(data.message);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cobrar con la tarjeta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="agenda-giftcard">
      <summary>
        <i className="fa-solid fa-gift" aria-hidden="true" /> Cobrar con tarjeta de regalo
      </summary>
      <div className="agenda-grid">
        <label>
          Código
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GC-XXXX-XXXX" />
        </label>
        <button type="button" className="btn-secondary" style={{ width: "auto", alignSelf: "end" }} onClick={lookup} disabled={!code.trim()}>
          Consultar saldo
        </button>
      </div>
      {card ? (
        <div className="agenda-grid">
          <p style={{ margin: 0, alignSelf: "end" }}>
            Saldo: <strong>{formatMxn(card.balance)}</strong>
            {card.recipientName ? ` · ${card.recipientName}` : ""}
          </p>
          <label>
            Cobrar
            <input type="number" min="0.01" step="0.01" max={card.balance} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <button type="button" style={{ width: "auto", alignSelf: "end" }} onClick={redeem} disabled={busy || !(Number(amount) > 0)}>
            Cobrar {formatMxn(Number(amount) || 0)}
          </button>
        </div>
      ) : null}
      {error ? <div className="auth-error">{error}</div> : null}
    </details>
  );
};

const AppointmentDialog = ({ appointment: initialAppointment, initialStart, initialSpecialist, specialists, services, onClose, onSaved, onChanged, asPage = false }) => {
  // Copia local: revisar un comprobante actualiza la cita sin cerrar el diálogo.
  const [appointment, setAppointment] = useState(initialAppointment);
  const [notice, setNotice] = useState("");
  const { can } = usePermissions();
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
    requireDeposit: false,
  }));
  const [addService, setAddService] = useState("");
  // Aviso por correo a la clienta en este cambio (si tiene correo y los
  // correos están encendidos en Ajustes de agenda).
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  // Tarjeta de sellos de la clienta (módulo loyalty). Si no está contratado o
  // no se tiene acceso, la consulta falla y simplemente no se muestra.
  const [loyalty, setLoyalty] = useState(null);
  useEffect(() => {
    const customer = appointment?.customer?._id || appointment?.customer;
    if (!customer && !appointment?.customerEmail) return undefined;
    let cancelled = false;
    axios
      .get(`${baseUrl}/api/loyalty/lookup`, {
        headers: getAuthHeaders(),
        params: { ...(customer ? { customer: String(customer) } : {}), ...(appointment.customerEmail ? { email: appointment.customerEmail } : {}) },
      })
      .then(({ data }) => !cancelled && data.found && data.programs?.stamps?.enabled && setLoyalty(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment?._id]);

  useEffect(() => {
    if (asPage) return undefined;
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, asPage]);

  const serviceById = useMemo(() => new Map(services.map((s) => [String(s._id), s])), [services]);
  const chosen = form.services.map((id) => serviceById.get(id) || appointment?.services.find((s) => String(s.service) === id)).filter(Boolean);
  const totalDuration = chosen.reduce((sum, s) => sum + s.durationMin, 0);
  const totalPrice = chosen.reduce((sum, s) => sum + s.price, 0);
  const specialist = specialists.find((s) => String(s._id) === String(form.specialist));
  // Anticipo que pedirían los servicios elegidos (Servicios → anticipo).
  const depositPreview = chosen.reduce((sum, s) => {
    const dep = s.deposit || {};
    if (dep.type === "fixed") return sum + (Number(dep.value) || 0);
    if (dep.type === "percent") return sum + ((Number(dep.value) || 0) * s.price) / 100;
    return sum;
  }, 0);
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
      if (form.requireDeposit && depositPreview > 0) body.requireDeposit = true;
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

  const body = (
    <>
        <header className="agenda-dialog-head">
          <h3 id="agenda-dialog-title">
            {isEditing ? `Cita #${appointment.appointmentNumber}` : "Nueva cita"}
            {isEditing ? <span className={`agenda-status agenda-status--${appointment.status}`}>{APPOINTMENT_STATUS_LABELS[appointment.status]}</span> : null}
          </h3>
          {!asPage ? (
            <button type="button" className="agenda-dialog-close" onClick={onClose} aria-label="Cerrar">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          ) : null}
        </header>

        {isEditing ? (
          <p className="agenda-dialog-meta">
            {appointment.source === "web" ? "Agendada en el sitio" : appointment.source === "walk_in" ? "En mostrador" : "Por teléfono"} ·{" "}
            {formatDateTime(appointment.createdAt)}
            {appointment.cancelledAt
              ? ` · Cancelada por ${appointment.cancelledBy === "customer" ? "la clienta" : appointment.cancelledBy === "system" ? "el sistema" : "el negocio"}${appointment.cancelReason ? `: ${appointment.cancelReason}` : ""}`
              : ""}
          </p>
        ) : null}

        {loyalty ? (
          <p className="agenda-dialog-meta">
            <i className="fa-solid fa-stamp" aria-hidden="true" /> Tarjeta de sellos: {loyalty.stamps} de {loyalty.programs.stamps.goal}
            {loyalty.rewardsAvailable ? (
              <strong>
                {" "}
                · Tiene {loyalty.rewardsAvailable === 1 ? "un beneficio" : `${loyalty.rewardsAvailable} beneficios`} disponible
                {loyalty.rewardsAvailable === 1 ? "" : "s"}: {loyalty.programs.stamps.reward} (se canjea en Lealtad)
              </strong>
            ) : null}
          </p>
        ) : null}

        {isEditing && (appointment.attendanceConfirmedAt || appointment.reminderSentAt) ? (
          <p className="agenda-dialog-meta">
            {appointment.attendanceConfirmedAt ? (
              <strong className="agenda-attendance">✓ Asistencia confirmada por la clienta ({formatDateTime(appointment.attendanceConfirmedAt)})</strong>
            ) : (
              `Recordatorio enviado ${formatDateTime(appointment.reminderSentAt)}; la clienta aún no confirma.`
            )}
          </p>
        ) : null}

        {isEditing && appointment.depositAmount ? (
          <p className="agenda-dialog-meta">
            <i className="fa-solid fa-money-bill-transfer" aria-hidden="true" /> Anticipo {formatMxn(appointment.depositAmount)} ·{" "}
            {appointment.depositPaidAt
              ? `recibido ${formatDateTime(appointment.depositPaidAt)}`
              : appointment.status === "pending_deposit"
                ? `fecha límite ${formatDateTime(appointment.depositDueAt)} (si no llega, la cita se libera sola)`
                : appointment.status === "deposit_review"
                  ? "comprobante por revisar"
                  : "no se recibió"}
          </p>
        ) : null}

        {notice ? <div className="auth-success">{notice}</div> : null}
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
                {appointment.status === "cancelled" && status === "confirmed"
                  ? "Reactivar"
                  : ["pending_deposit", "deposit_review"].includes(appointment.status) && status === "confirmed"
                    ? "Confirmar (anticipo recibido)"
                    : ACTION_LABELS[status]}
              </button>
            ))}
            {appointment.status !== "cancelled" ? (
              <input type="text" value={form.cancelReason} onChange={set("cancelReason")} maxLength={300} placeholder="Motivo si la cancelas (opcional)" />
            ) : null}
          </div>
        ) : null}

        {isEditing && appointment.depositAmount ? (
          <OrderPaymentProofs
            order={appointment}
            kind="appointment"
            onChange={(updated, message) => {
              if (updated) setAppointment(updated);
              setNotice(message);
              onChanged?.();
            }}
          />
        ) : null}

        {isEditing && can("giftCards") && ["confirmed", "pending", "completed"].includes(appointment.status) ? (
          <GiftCardRedeem appointment={appointment} onDone={setNotice} />
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

            {!isEditing && depositPreview > 0 ? (
              <label className="agenda-notify">
                <input type="checkbox" checked={form.requireDeposit} onChange={(e) => setForm((prev) => ({ ...prev, requireDeposit: e.target.checked }))} />
                Pedir anticipo de {formatMxn(Math.min(depositPreview, totalPrice))} (la cita espera el comprobante y se libera sola si vence)
              </label>
            ) : null}

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
            {!asPage ? (
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cerrar
              </button>
            ) : null}
          </footer>
        </form>
    </>
  );

  if (asPage) return <div className="agenda-dialog agenda-dialog--page">{body}</div>;

  return createPortal(
    <div className="agenda-dialog-backdrop" onClick={onClose}>
      <div className="agenda-dialog" role="dialog" aria-modal="true" aria-labelledby="agenda-dialog-title" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>,
    document.body
  );
};

export default AppointmentDialog;
