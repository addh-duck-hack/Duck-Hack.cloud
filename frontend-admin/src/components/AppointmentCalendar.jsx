import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import esLocale from "@fullcalendar/core/locales/es";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { APPOINTMENT_STATUS_LABELS, isAgendaManager } from "../utils/schedule";
import AppointmentDialog from "./AppointmentDialog";
import "./AppointmentCalendar.css";

// Agenda del panel (Fase 2.4) con FullCalendar: día / semana / mes / lista.
// - Encargadas ven a todas (filtro por especialista, color de cada una); una
//   colaboradora solo su agenda (el backend filtra).
// - Arrastrar una cita la reprograma (el backend valida; fuera de horario
//   pregunta, empalmada la regresa a su lugar). La duración sale de los
//   servicios, así que no se estira con el mouse: se cambia en el detalle.
// - Clic o arrastre en un hueco: alta manual con esa hora (modal). Clic en
//   una cita: su vista (AppointmentDetail.jsx, /admin/appointments/:id).
// - Bloqueos: los de una especialista son bloques rayados con su color y
//   "motivo · especialista"; los de todo el negocio, fondo gris "Cerrado".
//   Clic en un bloqueo lleva a "Bloqueos".
// - Fuera de horario, sombreado: el del negocio, o el de la especialista
//   filtrada (así se ven sus días de descanso).
// Las horas se muestran en la zona de esta computadora (la de la tienda).

const DEFAULT_RANGE = { min: "08:00:00", max: "21:00:00" };
const narrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches;

const AppointmentCalendar = () => {
  const navigate = useNavigate();
  const isManager = isAgendaManager(localStorage.getItem("role"));
  const calendarRef = useRef(null);
  const [specialists, setSpecialists] = useState([]);
  const [services, setServices] = useState([]);
  const [filter, setFilter] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [hours, setHours] = useState(DEFAULT_RANGE);
  const [storeHours, setStoreHours] = useState([]);
  const [dialog, setDialog] = useState(null); // { appointment } | { start, specialist }
  const [error, setError] = useState("");

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
    // Rango visible del día según el horario del negocio (con 1 h de margen).
    axios
      .get(`${baseUrl}/api/store-config/public`)
      .then(({ data }) => {
        const open = (data?.businessHours || []).filter((h) => !h.closed && h.open && h.close);
        setStoreHours(open);
        if (!open.length) return;
        const minH = Math.max(0, Math.min(...open.map((h) => Number(h.open.slice(0, 2)))) - 1);
        const maxH = Math.min(24, Math.max(...open.map((h) => Number(h.close.slice(0, 2)) + (h.close.endsWith(":00") ? 0 : 1))) + 1);
        setHours({ min: `${String(minH).padStart(2, "0")}:00:00`, max: `${String(maxH).padStart(2, "0")}:00:00` });
      })
      .catch(() => {});
  }, [baseUrl, headers]);

  const refetch = () => calendarRef.current?.getApi().refetchEvents();

  // Citas + bloqueos del rango visible.
  const loadEvents = useCallback(
    async (info, success, failure) => {
      try {
        const params = { from: info.start.toISOString(), to: info.end.toISOString() };
        if (filter) params.specialist = filter;
        const [appointmentsRes, blocksRes] = await Promise.all([
          axios.get(`${baseUrl}/api/appointments`, { headers, params }),
          axios.get(`${baseUrl}/api/appointments/blocks`, { headers, params }),
        ]);
        const appointments = (appointmentsRes.data?.items || [])
          .filter((a) => showCancelled || a.status !== "cancelled")
          .map((a) => ({
            id: a._id,
            title: `${a.attendanceConfirmedAt ? "✓ " : ""}${a.customerName} · ${a.services.map((s) => s.name).join(" + ")}`,
            start: a.start,
            end: a.end,
            backgroundColor: a.specialist?.color || "#4abdfc",
            borderColor: a.specialist?.color || "#4abdfc",
            editable: ["pending_deposit", "deposit_review", "pending", "confirmed"].includes(a.status),
            classNames: [`agenda-event--${a.status}`],
            extendedProps: { appointment: a },
          }));
        const blocks = (blocksRes.data?.items || []).map((b) =>
          b.specialist
            ? {
                id: `block-${b._id}`,
                start: b.start,
                end: b.end,
                title: `${b.reason || "Bloqueado"} · ${b.specialist.name}`,
                editable: false,
                classNames: ["agenda-block-event"],
                backgroundColor: "transparent",
                borderColor: b.specialist.color,
                textColor: "var(--text-color)",
                extendedProps: { block: b },
              }
            : {
                id: `block-${b._id}`,
                start: b.start,
                end: b.end,
                display: "background",
                classNames: ["agenda-block"],
                title: `Cerrado${b.reason ? `: ${b.reason}` : ""}`,
              }
        );
        setError("");
        success([...appointments, ...blocks]);
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar la agenda.");
        failure(err);
      }
    },
    [baseUrl, headers, filter, showCancelled]
  );

  // Arrastrar = reprogramar. Fuera de horario: preguntar y reintentar con force.
  const handleDrop = async (info) => {
    const move = (force) =>
      axios.put(`${baseUrl}/api/appointments/${info.event.id}`, { start: info.event.start.toISOString(), ...(force ? { force: true } : {}) }, { headers });
    try {
      try {
        await move(false);
      } catch (err) {
        const apiError = err.response?.data?.error;
        if (apiError?.code === "OUTSIDE_HOURS" && window.confirm(apiError.message)) await move(true);
        else throw err;
      }
      setError("");
      refetch();
    } catch (err) {
      info.revert();
      setError(err.response?.data?.error?.message || "No fue posible mover la cita.");
    }
  };

  // Horario que se marca como "abierto" (lo demás, sombreado): el de la
  // especialista filtrada o el del negocio.
  const businessHours = useMemo(() => {
    const shifts = filter ? specialists.find((sp) => String(sp._id) === String(filter))?.weeklyHours || [] : storeHours;
    if (filter && !shifts.length) return [{ daysOfWeek: [], startTime: "00:00", endTime: "00:00" }];
    return shifts.length ? shifts.map((h) => ({ daysOfWeek: [h.day], startTime: h.open, endTime: h.close })) : false;
  }, [filter, specialists, storeHours]);
  const filteredName = filter ? specialists.find((sp) => String(sp._id) === String(filter))?.name : "";

  const openNew = (start) => setDialog({ start, specialist: filter || (isManager ? "" : specialists[0]?._id) });

  const ownSpecialistMissing = !isManager && specialists.length === 0;

  return (
    <section className="agenda">
      <div className="agenda-toolbar">
        <h3 style={{ margin: 0 }}>Agenda</h3>
        <div className="agenda-toolbar-actions">
          {isManager ? (
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar por especialista">
              <option value="">Todas las especialistas</option>
              {specialists.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
          <label className="agenda-check">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            Ver canceladas
          </label>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/time-blocks")} style={{ width: "auto" }}>
            Bloquear horario
          </button>
          <button type="button" onClick={() => openNew(new Date())} disabled={ownSpecialistMissing || !specialists.length} style={{ width: "auto" }}>
            Nueva cita
          </button>
        </div>
      </div>

      {ownSpecialistMissing ? (
        <p className="agenda-note">Tu cuenta todavía no está ligada a una especialista. Pide a la administración que la ligue en "Especialistas".</p>
      ) : null}
      {isManager && specialists.length === 0 ? (
        <p className="agenda-note">
          Para agendar, primero da de alta a tus especialistas en <a href="#/admin/specialists">Especialistas</a>.
        </p>
      ) : null}

      {isManager && specialists.length > 1 ? (
        <ul className="agenda-legend" aria-label="Colores por especialista">
          {specialists.map((s) => (
            <li key={s._id}>
              <span style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="agenda-hint">
        <span className="agenda-hint-block" aria-hidden="true" /> Bloqueo de una especialista
        <span className="agenda-hint-closed" aria-hidden="true" /> Cerrado / fuera de horario
        {filteredName ? ` de ${filteredName} (sus días de descanso salen sombreados)` : " del negocio"}
      </p>

      {error ? <div className="auth-error">{error}</div> : null}

      <div className="agenda-calendar">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          locale={esLocale}
          initialView={narrow() ? "listWeek" : "timeGridWeek"}
          headerToolbar={{ left: "prev,next today", center: "title", right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek" }}
          buttonText={{ list: "Lista" }}
          height="auto"
          allDaySlot={false}
          nowIndicator
          slotDuration="00:15:00"
          slotLabelInterval="01:00"
          slotMinTime={hours.min}
          slotMaxTime={hours.max}
          businessHours={businessHours}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          events={loadEvents}
          selectable={!ownSpecialistMissing}
          selectMirror
          select={(info) => {
            calendarRef.current?.getApi().unselect();
            openNew(info.start);
          }}
          dateClick={(info) => {
            if (info.view.type === "dayGridMonth") calendarRef.current?.getApi().changeView("timeGridDay", info.date);
          }}
          editable
          eventDurationEditable={false}
          eventDrop={handleDrop}
          eventClick={(info) => {
            const { appointment, block } = info.event.extendedProps;
            if (appointment) navigate(`/admin/appointments/${appointment._id}`);
            else if (block) navigate("/admin/time-blocks");
          }}
          eventDidMount={(info) => {
            const { block } = info.event.extendedProps;
            if (block) {
              info.el.style.setProperty("--block-color", block.specialist.color);
              info.el.title = `${info.event.title}\nClic para ver los bloqueos`;
              return;
            }
            const a = info.event.extendedProps.appointment;
            if (a) {
              info.el.title = `${info.event.title}\n${a.specialist?.name || a.specialistName} · ${APPOINTMENT_STATUS_LABELS[a.status]}${
                a.attendanceConfirmedAt ? " · asistencia confirmada" : ""
              }`;
            }
          }}
        />
      </div>

      {dialog ? (
        <AppointmentDialog
          appointment={dialog.appointment}
          initialStart={dialog.start}
          initialSpecialist={dialog.specialist}
          specialists={specialists}
          services={services}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refetch();
          }}
          onChanged={refetch}
        />
      ) : null}
    </section>
  );
};

export default AppointmentCalendar;
