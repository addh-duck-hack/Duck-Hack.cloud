import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { APPOINTMENT_STATUS_LABELS, isAgendaManager } from "../utils/schedule";
import AppointmentDialog from "./AppointmentDialog";
import "./AppointmentList.css";

// Listado de citas (módulo "appointments"; backend GET /api/appointments/list
// en packages/core-api/modules/appointments.js): lo que la agenda no deja ver
// de un vistazo — todas las de hoy, las próximas y el historial, con búsqueda
// y filtros. Clic en una cita abre el mismo detalle que la agenda
// (AppointmentDialog). Una colaboradora solo ve las de su especialista.

const TABS = [
  { id: "today", label: "Hoy" },
  { id: "upcoming", label: "Próximas" },
  { id: "past", label: "Pasadas" },
];

const STATUS_COLORS = {
  pending_deposit: "yellow",
  deposit_review: "yellow",
  pending: "yellow",
  confirmed: "green",
  completed: "blue",
  no_show: "red",
  cancelled: "red",
};

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const formatWhen = (value, tz, withDate) =>
  new Date(value).toLocaleString("es-MX", {
    timeZone: tz,
    ...(withDate ? { weekday: "short", day: "numeric", month: "short", year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  });

const PAGE_SIZE = 25;

const AppointmentList = () => {
  const isManager = isAgendaManager(localStorage.getItem("role"));
  const [when, setWhen] = useState("upcoming");
  const [status, setStatus] = useState("");
  const [specialist, setSpecialist] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [specialists, setSpecialists] = useState([]);
  const [services, setServices] = useState([]);
  const [dialog, setDialog] = useState(null);

  const baseUrl = getApiBaseUrl();
  const headers = useMemo(() => ({ Authorization: `Bearer ${localStorage.getItem("token")}` }), []);

  useEffect(() => {
    axios
      .get(`${baseUrl}/api/appointments/specialists`, { headers })
      .then((r) => setSpecialists(r.data?.items || []))
      .catch(() => setSpecialists([]));
    axios
      .get(`${baseUrl}/api/services`, { headers })
      .then((r) => setServices(r.data?.items || []))
      .catch(() => setServices([]));
  }, [baseUrl, headers]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const params = { when, page, limit: PAGE_SIZE, status: status || undefined, specialist: specialist || undefined, q: query || undefined };
      const { data: res } = await axios.get(`${baseUrl}/api/appointments/list`, { headers, params });
      setData(res);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar las citas.");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, headers, when, page, status, specialist, query]);

  useEffect(() => {
    load();
  }, [load]);

  // Cambiar de pestaña o de filtro vuelve a la primera página.
  const pick = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const items = data?.items || [];
  const tz = data?.timezone;
  const filtered = Boolean(status || specialist || query);

  return (
    <section>
      <div className="appt-list-head">
        <h3 style={{ margin: 0 }}>Citas</h3>
        <Link to="/admin/appointments" className="btn-secondary appt-list-link">
          <i className="fa-solid fa-calendar-days" aria-hidden="true" /> Ver agenda
        </Link>
      </div>

      <div className="appt-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={when === tab.id}
            className={`appt-tab${when === tab.id ? " is-active" : ""}`}
            onClick={() => pick(setWhen)(tab.id)}
          >
            {tab.label}
            <span className="appt-tab-count">{data?.counts?.[tab.id] ?? "…"}</span>
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          pick(setQuery)(q.trim());
        }}
        className="appt-filters"
      >
        <select value={status} onChange={(e) => pick(setStatus)(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(APPOINTMENT_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {isManager && specialists.length > 1 ? (
          <select value={specialist} onChange={(e) => pick(setSpecialist)(e.target.value)} aria-label="Especialista">
            <option value="">Todas las especialistas</option>
            {specialists.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Clienta, correo, teléfono o servicio" />
        <button type="submit">Buscar</button>
        {filtered ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setQ("");
              setStatus("");
              setSpecialist("");
              setQuery("");
              setPage(1);
            }}
          >
            Limpiar
          </button>
        ) : null}
      </form>

      {error ? <div className="auth-error">{error}</div> : null}
      {isLoading && !data ? <p>Cargando...</p> : null}
      {data && !items.length ? (
        <p className="appt-empty">
          {filtered ? "No hay citas con ese filtro." : when === "today" ? "No hay citas hoy." : when === "upcoming" ? "No hay citas próximas." : "Todavía no hay citas pasadas."}
        </p>
      ) : null}

      {items.length ? (
        <div style={{ overflowX: "auto", opacity: isLoading ? 0.6 : 1 }}>
          <table className="appt-table">
            <thead>
              <tr>
                <th>{when === "today" ? "Hora" : "Fecha"}</th>
                <th>Clienta</th>
                <th>Servicios</th>
                <th>Especialista</th>
                <th>Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a._id} onClick={() => setDialog(a)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setDialog(a)}>
                  <td className="appt-when">{formatWhen(a.start, tz, when !== "today")}</td>
                  <td>
                    {a.customerName}
                    {a.customerPhone || a.customerEmail ? <small className="appt-sub">{a.customerPhone || a.customerEmail}</small> : null}
                  </td>
                  <td>{(a.services || []).map((s) => s.name).join(" + ")}</td>
                  <td>
                    {a.specialist ? (
                      <span className="appt-specialist">
                        <span className="appt-dot" style={{ background: a.specialist.color || "var(--primary-color)" }} />
                        {a.specialist.name}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{formatMxn(a.total)}</td>
                  <td>
                    <span className={`badge badge-${STATUS_COLORS[a.status] || "blue"}`}>{APPOINTMENT_STATUS_LABELS[a.status] || a.status}</span>
                    {a.attendanceConfirmedAt && ["pending", "confirmed"].includes(a.status) ? <small className="appt-sub">✓ Asistencia confirmada</small> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data?.pages > 1 ? (
        <div className="appt-pager">
          <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </button>
          <span>
            Página {page} de {data.pages} · {data.total} citas
          </span>
          <button type="button" className="btn-secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </button>
        </div>
      ) : null}

      {dialog ? (
        <AppointmentDialog
          appointment={dialog}
          specialists={specialists}
          services={services}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            load();
          }}
          onChanged={load}
        />
      ) : null}
    </section>
  );
};

export default AppointmentList;
