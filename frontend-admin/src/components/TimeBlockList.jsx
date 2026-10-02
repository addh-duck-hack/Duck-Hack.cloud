import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatDateTime, isAgendaManager } from "../utils/schedule";

// Bloqueos de horario (comida, vacaciones, cursos): en ese tiempo no se puede
// agendar. La administración bloquea a cualquier especialista o a todo el
// negocio; una colaboradora, solo su propio horario. Se muestran los que
// todavía no terminan. Las fechas se capturan en la hora de esta
// computadora (la de la tienda).

const emptyForm = { specialist: "", allDay: false, startDate: "", startTime: "14:00", endDate: "", endTime: "15:00", reason: "" };

const TimeBlockList = () => {
  const isManager = isAgendaManager(localStorage.getItem("role"));
  const [blocks, setBlocks] = useState([]);
  const [specialists, setSpecialists] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/appointments/blocks`, {
        headers: getAuthHeaders(),
        params: { from: new Date().toISOString() },
      });
      setBlocks(response.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar los bloqueos.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    axios
      .get(`${baseUrl}/api/appointments/specialists`, { headers: getAuthHeaders(), params: { isActive: "true" } })
      .then((response) => setSpecialists(response.data?.items || []))
      .catch(() => setSpecialists([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => {
      const next = { ...prev, [name]: type === "checkbox" ? checked : value };
      // El fin arranca el mismo día que el inicio.
      if (name === "startDate" && (!prev.endDate || prev.endDate < value)) next.endDate = value;
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.startDate || !form.endDate) {
      setError("Elige las fechas del bloqueo.");
      return;
    }
    const [sy, sm, sd] = form.startDate.split("-").map(Number);
    const [ey, em, ed] = form.endDate.split("-").map(Number);
    const at = (y, m, d, time) => {
      const [h, min] = time.split(":").map(Number);
      return new Date(y, m - 1, d, h, min);
    };
    // Todo el día: del inicio del primer día al inicio del día siguiente al último.
    const start = form.allDay ? new Date(sy, sm - 1, sd) : at(sy, sm, sd, form.startTime);
    const end = form.allDay ? new Date(ey, em - 1, ed + 1) : at(ey, em, ed, form.endTime);
    setIsSaving(true);
    try {
      await axios.post(
        `${baseUrl}/api/appointments/blocks`,
        { specialist: form.specialist || null, start: start.toISOString(), end: end.toISOString(), reason: form.reason },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible bloquear el horario.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Quitar este bloqueo? Ese horario vuelve a estar disponible.")) return;
    setError("");
    try {
      await axios.delete(`${baseUrl}/api/appointments/blocks/${id}`, { headers: getAuthHeaders() });
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible quitar el bloqueo.");
    }
  };

  const canDelete = (block) => isManager || Boolean(block.specialist);

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Bloqueos de horario</h3>
      <p>En un horario bloqueado no se puede agendar: comida, vacaciones, cursos o un día que no abran.</p>

      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: "0 0 1.5rem" }}>
        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr 1fr", gap: "0.75rem", alignItems: "end" }}>
          {isManager ? (
            <label>
              Quién
              <select name="specialist" value={form.specialist} onChange={handleChange}>
                <option value="">Todo el negocio</option>
                {specialists.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p style={{ margin: 0 }}>Tu horario</p>
          )}
          <label>
            Desde
            <input type="date" name="startDate" value={form.startDate} onChange={handleChange} required />
          </label>
          {!form.allDay ? (
            <label>
              Hora
              <input type="time" name="startTime" value={form.startTime} onChange={handleChange} required />
            </label>
          ) : (
            <span />
          )}
          <label>
            Hasta
            <input type="date" name="endDate" value={form.endDate} min={form.startDate || undefined} onChange={handleChange} required />
          </label>
          {!form.allDay ? (
            <label>
              Hora
              <input type="time" name="endTime" value={form.endTime} onChange={handleChange} required />
            </label>
          ) : (
            <span />
          )}
        </div>
        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: "0.75rem", alignItems: "end" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="allDay" checked={form.allDay} onChange={handleChange} style={{ width: "auto" }} />
            Todo el día
          </label>
          <label>
            Motivo (opcional)
            <input type="text" name="reason" value={form.reason} onChange={handleChange} maxLength={120} placeholder="Vacaciones, comida, curso…" />
          </label>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Guardando..." : "Bloquear"}
          </button>
        </div>
      </form>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Quién</th>
              <th>Desde</th>
              <th>Hasta</th>
              <th>Motivo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && blocks.length === 0 ? (
              <tr>
                <td colSpan={5}>Sin bloqueos próximos.</td>
              </tr>
            ) : null}
            {blocks.map((b) => (
              <tr key={b._id}>
                <td>
                  {b.specialist ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: b.specialist.color }} />
                      {b.specialist.name}
                    </span>
                  ) : (
                    <strong>Todo el negocio</strong>
                  )}
                </td>
                <td>{formatDateTime(b.start)}</td>
                <td>{formatDateTime(b.end)}</td>
                <td>{b.reason || "—"}</td>
                <td>
                  {canDelete(b) ? (
                    <button type="button" className="btn-secondary" onClick={() => handleDelete(b._id)}>
                      Quitar
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default TimeBlockList;
