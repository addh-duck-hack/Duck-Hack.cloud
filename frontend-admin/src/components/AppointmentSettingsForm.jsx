import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { usePermissions } from "../hooks/usePermissions";

// Ajustes de la agenda (AppointmentSettings, packages/core-api/modules/
// appointments.js). El horario general y los días festivos siguen en
// "Configurar tienda".

const SLOT_STEPS = [5, 10, 15, 20, 30, 60];
const TIMEZONES = ["America/Mexico_City", "America/Cancun", "America/Merida", "America/Monterrey", "America/Chihuahua", "America/Mazatlan", "America/Hermosillo", "America/Tijuana"];

const AppointmentSettingsForm = () => {
  // "Recordatorios" es un módulo aparte (se vende por separado).
  const { can } = usePermissions();
  const [form, setForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    axios
      .get(`${baseUrl}/api/appointments/settings`, { headers: getAuthHeaders() })
      .then(({ data }) =>
        setForm({
          ...data,
          minNoticeHours: String(data.minNoticeMin / 60),
          maxDaysAhead: String(data.maxDaysAhead),
          reminderHoursBefore: String(data.reminderHoursBefore ?? 24),
          reviewRequestHoursAfter: String(data.reviewRequestHoursAfter ?? 2),
          minHoursToChange: String(data.minHoursToChange),
        })
      )
      .catch((err) => setError(err.response?.data?.error?.message || "No fue posible cargar los ajustes."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setMessage("");
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        autoConfirm: form.autoConfirm,
        allowAnySpecialist: form.allowAnySpecialist,
        emailCustomer: form.emailCustomer,
        emailBusiness: form.emailBusiness,
        ...(can("reminders") ? { reminderEnabled: form.reminderEnabled, reminderHoursBefore: Number(form.reminderHoursBefore) } : {}),
        ...(can("reviews")
          ? { reviewRequestEnabled: form.reviewRequestEnabled, reviewRequestHoursAfter: Number(form.reviewRequestHoursAfter) }
          : {}),
        slotStepMin: Number(form.slotStepMin),
        minNoticeMin: Math.round(Number(form.minNoticeHours) * 60),
        maxDaysAhead: Number(form.maxDaysAhead),
        minHoursToChange: Number(form.minHoursToChange),
        timezone: form.timezone,
        notifyEmail: form.notifyEmail,
      };
      const { data } = await axios.put(`${baseUrl}/api/appointments/settings`, payload, {
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      });
      setMessage(data.message || "Ajustes guardados.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar los ajustes.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!form) return error ? <div className="auth-error">{error}</div> : <p>Cargando...</p>;

  return (
    <section style={{ maxWidth: 1000 }}>
      <h3 style={{ marginTop: 0 }}>Ajustes de la agenda</h3>
      <p>El horario del negocio y los días festivos se configuran en "Configurar tienda".</p>

      {error ? <div className="auth-error">{error}</div> : null}
      {message ? <div className="auth-success">{message}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" name="autoConfirm" checked={form.autoConfirm} onChange={handleChange} style={{ width: "auto" }} />
          Confirmar automáticamente las citas que se agendan en el sitio
        </label>
        <small style={{ display: "block", margin: "-0.25rem 0 0.75rem 1.6rem" }}>
          Si lo apagas, entran como "Por confirmar" y las confirmas desde la agenda. En ambos casos el horario queda apartado.
        </small>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" name="allowAnySpecialist" checked={form.allowAnySpecialist} onChange={handleChange} style={{ width: "auto" }} />
          Ofrecer "Cualquiera disponible" al agendar
        </label>

        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.75rem", marginTop: "0.75rem" }}>
          <label>
            Horarios cada
            <select name="slotStepMin" value={form.slotStepMin} onChange={handleChange}>
              {SLOT_STEPS.map((step) => (
                <option key={step} value={step}>
                  {step} min
                </option>
              ))}
            </select>
          </label>
          <label>
            Anticipación mínima (horas)
            <input type="number" name="minNoticeHours" min="0" max="168" step="0.25" value={form.minNoticeHours} onChange={handleChange} required />
            <small>Para agendar en línea.</small>
          </label>
          <label>
            Agendar hasta (días)
            <input type="number" name="maxDaysAhead" min="1" max="365" step="1" value={form.maxDaysAhead} onChange={handleChange} required />
          </label>
          <label>
            Cambios hasta (horas antes)
            <input type="number" name="minHoursToChange" min="0" max="336" step="1" value={form.minHoursToChange} onChange={handleChange} required />
            <small>Cancelar o reprogramar desde el sitio.</small>
          </label>
        </div>

        <fieldset style={{ marginTop: "0.75rem" }}>
          <legend>Correos</legend>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="emailCustomer" checked={form.emailCustomer} onChange={handleChange} style={{ width: "auto" }} />
            Avisar a la clienta cuando su cita se agenda, confirma, cambia de horario o se cancela (con archivo de calendario)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="emailBusiness" checked={form.emailBusiness} onChange={handleChange} style={{ width: "auto" }} />
            Avisar al negocio cuando una clienta agenda, cancela o reprograma desde el sitio
          </label>
        </fieldset>

        {can("reminders") ? (
          <fieldset style={{ marginTop: "0.75rem" }}>
            <legend>Recordatorios</legend>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input type="checkbox" name="reminderEnabled" checked={form.reminderEnabled} onChange={handleChange} style={{ width: "auto" }} />
              Mandar un recordatorio por correo antes de cada cita confirmada
            </label>
            <label style={{ maxWidth: 260 }}>
              Cuántas horas antes
              <input
                type="number"
                name="reminderHoursBefore"
                min="1"
                max="72"
                step="1"
                value={form.reminderHoursBefore}
                onChange={handleChange}
                disabled={!form.reminderEnabled}
                required
              />
            </label>
            <small>
              Lleva "Confirmo mi asistencia" y "Reprogramar o cancelar". No se manda a citas agendadas o movidas dentro de ese plazo (ya
              recibieron su correo).
            </small>
          </fieldset>
        ) : null}

        {can("reviews") ? (
          <fieldset style={{ marginTop: "0.75rem" }}>
            <legend>Calificación después de la cita</legend>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input type="checkbox" name="reviewRequestEnabled" checked={form.reviewRequestEnabled} onChange={handleChange} style={{ width: "auto" }} />
              Pedir por correo que califiquen la cita cuando se marca como completada
            </label>
            <label style={{ maxWidth: 260 }}>
              Cuántas horas después de terminar
              <input
                type="number"
                name="reviewRequestHoursAfter"
                min="1"
                max="72"
                step="1"
                value={form.reviewRequestHoursAfter}
                onChange={handleChange}
                disabled={!form.reviewRequestEnabled}
                required
              />
            </label>
            <small>Una sola vez por cita. Las calificaciones llegan a Reseñas → Citas para aprobarlas y, si quieres, publicarlas como testimonio.</small>
          </fieldset>
        ) : null}

        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Zona horaria
            <select name="timezone" value={form.timezone} onChange={handleChange}>
              {(TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES]).map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <label>
            Avisos de citas a (opcional)
            <input type="email" name="notifyEmail" value={form.notifyEmail} onChange={handleChange} maxLength={160} placeholder="Correo de contacto de la tienda" />
          </label>
        </div>

        <button type="submit" disabled={isSaving} style={{ width: "auto", marginTop: "1rem" }}>
          {isSaving ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </section>
  );
};

export default AppointmentSettingsForm;
