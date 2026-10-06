import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { acceptForKinds, mediaSrc } from "../utils/mediaApi";
import { usePermissions } from "../hooks/usePermissions";
import AppointmentDialog from "./AppointmentDialog";
import MediaPreview from "./MediaPreview";
import Loader from "./Loader";
import Alert from "./Alert";
import "./AppointmentDetail.css";

// Vista de una cita (/admin/appointments/:id, módulo "appointments"). La abren
// la agenda y el listado de Citas. Al centro, el mismo detalle que antes era
// el modal (AppointmentDialog en modo página): estado, servicios, horario,
// clienta, anticipo, notas. Al lado:
// - Fotos y videos: van a la biblioteca de medios (URL pública), así que
//   primero se marca que la clienta autorizó subirlos al sitio
//   (PUT /:id/media-consent). Quitar uno lo borra también de la biblioteca si
//   nada más lo usa.
// - Reseñas: la de esta cita y el historial de la clienta
//   (GET /:id/reviews); aprobar / rechazar solo con el módulo Reseñas.

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const errorOf = (err, fallback) => err.response?.data?.error?.message || fallback;
const formatDate = (value) => new Date(value).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

const Stars = ({ rating }) => (
  <span className="appt-stars" aria-label={`${rating} de 5 estrellas`}>
    {"★".repeat(rating)}
    <span className="appt-stars-off">{"★".repeat(5 - rating)}</span>
  </span>
);

const REVIEW_STATUS = {
  pending: { label: "Por moderar", color: "yellow" },
  approved: { label: "Publicada", color: "green" },
  rejected: { label: "Rechazada", color: "red" },
};

// ---- Fotos y videos ----
const AppointmentMedia = ({ appointment, onUpdated }) => {
  const baseUrl = getApiBaseUrl();
  const { can } = usePermissions();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewing, setViewing] = useState(null);
  const consent = appointment.mediaConsent?.given === true;
  const media = appointment.media || [];

  const toggleConsent = async (given) => {
    setError("");
    setNotice("");
    try {
      const { data } = await axios.put(`${baseUrl}/api/appointments/${appointment._id}/media-consent`, { given }, { headers: headers() });
      onUpdated(data.appointment);
    } catch (err) {
      setError(errorOf(err, "No fue posible guardar la autorización."));
    }
  };

  // Uno por uno, para que un archivo que falle no tumbe a los demás.
  const upload = async (files) => {
    setBusy(true);
    setError("");
    setNotice("");
    const failures = [];
    let latest = null;
    for (const [index, file] of [...files].entries()) {
      setProgress(`Subiendo ${index + 1} de ${files.length}…`);
      try {
        const form = new FormData();
        form.append("media", file);
        const { data } = await axios.post(`${baseUrl}/api/appointments/${appointment._id}/media`, form, {
          headers: { ...headers(), "Content-Type": "multipart/form-data" },
        });
        latest = data.appointment;
      } catch (err) {
        failures.push(`${file.name}: ${errorOf(err, "no se pudo subir")}`);
      }
    }
    if (latest) onUpdated(latest);
    setProgress("");
    setBusy(false);
    if (failures.length) setError(failures.join(" · "));
    else setNotice(files.length === 1 ? "Archivo agregado." : `${files.length} archivos agregados.`);
  };

  const remove = async (item) => {
    if (!window.confirm("¿Quitar este archivo de la cita? Si no se usa en otro lugar, también se borra de la biblioteca de medios.")) return;
    setError("");
    try {
      const fileName = item.path.split("/").pop();
      const { data } = await axios.delete(`${baseUrl}/api/appointments/${appointment._id}/media/${encodeURIComponent(fileName)}`, { headers: headers() });
      setViewing(null);
      setNotice(data.message);
      onUpdated(data.appointment);
    } catch (err) {
      setError(errorOf(err, "No fue posible quitar el archivo."));
    }
  };

  return (
    <section className="appt-card">
      <h4>
        <i className="fa-solid fa-camera" aria-hidden="true" /> Fotos y videos
      </h4>
      <label className="appt-consent">
        <input type="checkbox" checked={consent} onChange={(e) => toggleConsent(e.target.checked)} disabled={busy} />
        <span>
          La clienta autoriza subir fotos y videos de su cita al sitio
          {appointment.mediaConsent?.at ? <small> · registrado el {formatDate(appointment.mediaConsent.at)}</small> : null}
        </span>
      </label>
      {!consent ? (
        <p className="appt-muted">Pregúntale antes de tomar fotos: se guardan en la biblioteca de medios, que puede mostrarse en el sitio.</p>
      ) : (
        <label className={`appt-upload${busy ? " is-busy" : ""}`}>
          <input
            type="file"
            multiple
            accept={acceptForKinds(["image", "gif", "video"])}
            disabled={busy}
            onChange={(e) => {
              const files = e.target.files;
              if (files?.length) upload(files);
              e.target.value = "";
            }}
          />
          <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" />
          {progress || "Agregar fotos o videos (JPG, PNG, GIF hasta 10 MB · MP4, WebM hasta 50 MB)"}
        </label>
      )}
      {notice ? <Alert type="success">{notice}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      {media.length ? (
        <ul className="appt-media-grid">
          {media.map((item) => (
            <li key={item.path}>
              <button type="button" className="appt-media-thumb" onClick={() => setViewing(item)} aria-label="Ver en grande">
                <MediaPreview item={{ kind: item.kind, title: "Foto de la cita", altText: "Foto de la cita" }} src={mediaSrc(item.path)} />
                {item.kind === "video" ? <i className="fa-solid fa-play appt-media-play" aria-hidden="true" /> : null}
              </button>
              <button type="button" className="btn-secondary appt-media-remove" onClick={() => remove(item)} aria-label="Quitar de la cita">
                <i className="fa-solid fa-trash" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : consent ? (
        <p className="appt-muted">Todavía no hay fotos ni videos.</p>
      ) : null}
      {media.length && can("media") ? (
        <p className="appt-muted">
          También están en <Link to="/admin/media">Medios</Link>, donde puedes ponerlas en la galería del sitio.
        </p>
      ) : null}

      {viewing ? (
        <div className="appt-viewer" role="dialog" aria-modal="true" onClick={() => setViewing(null)}>
          <div className="appt-viewer-body" onClick={(e) => e.stopPropagation()}>
            <MediaPreview item={{ kind: viewing.kind, title: "Foto de la cita", altText: "Foto de la cita" }} src={mediaSrc(viewing.path)} controls />
            <div className="appt-viewer-actions">
              <a href={mediaSrc(viewing.path)} target="_blank" rel="noreferrer" className="btn-secondary">
                Abrir original
              </a>
              <button type="button" className="btn-secondary" onClick={() => remove(viewing)}>
                Quitar de la cita
              </button>
              <button type="button" onClick={() => setViewing(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

// ---- Reseñas ----
const ReviewItem = ({ review, canModerate, onModerated }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = REVIEW_STATUS[review.status] || { label: review.status, color: "blue" };

  const moderate = async (next) => {
    let rejectionReason;
    if (next === "rejected") {
      rejectionReason = window.prompt("Motivo del rechazo (lo ve la clienta, no se publica). Opcional:", "");
      if (rejectionReason === null) return;
    }
    setBusy(true);
    setError("");
    try {
      await axios.put(`${getApiBaseUrl()}/api/reviews/${review._id}`, { status: next, rejectionReason }, { headers: headers() });
      onModerated();
    } catch (err) {
      setError(errorOf(err, "No fue posible moderar la reseña."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="appt-review">
      <div className="appt-review-head">
        <Stars rating={review.rating} />
        <span className={`badge badge-${status.color}`}>{status.label}</span>
      </div>
      <small className="appt-muted">
        {review.label} · {formatDate(review.createdAt)}
      </small>
      {review.comment ? <p>“{review.comment}”</p> : <p className="appt-muted">Sin comentario.</p>}
      {review.status === "rejected" && review.rejectionReason ? <small className="appt-muted">Motivo del rechazo: {review.rejectionReason}</small> : null}
      {canModerate ? (
        <div className="appt-review-actions">
          {review.status !== "approved" ? (
            <button type="button" onClick={() => moderate("approved")} disabled={busy}>
              Aprobar
            </button>
          ) : null}
          {review.status !== "rejected" ? (
            <button type="button" className="btn-secondary" onClick={() => moderate("rejected")} disabled={busy}>
              Rechazar
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <Alert type="error">{error}</Alert> : null}
    </div>
  );
};

const AppointmentReviews = ({ appointment }) => {
  const { can } = usePermissions();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    axios
      .get(`${getApiBaseUrl()}/api/appointments/${appointment._id}/reviews`, { headers: headers() })
      .then(({ data: res }) => setData(res))
      .catch((err) => setError(errorOf(err, "No fue posible cargar las reseñas.")));
  }, [appointment._id]);

  useEffect(() => {
    load();
  }, [load]);

  if (data && !data.enabled) return null;
  const canModerate = can("reviews");

  return (
    <section className="appt-card">
      <h4>
        <i className="fa-solid fa-star" aria-hidden="true" /> Reseñas
      </h4>
      {error ? <Alert type="error">{error}</Alert> : null}
      {!data && !error ? <p className="appt-muted">Cargando…</p> : null}
      {data ? (
        <>
          <h5>De esta cita</h5>
          {data.review ? (
            <ReviewItem review={data.review} canModerate={canModerate} onModerated={load} />
          ) : (
            <p className="appt-muted">
              {appointment.status === "completed"
                ? appointment.reviewRequestSentAt
                  ? "Se le pidió su calificación por correo; todavía no responde."
                  : "Todavía no la califica."
                : "Se puede calificar cuando la cita esté completada."}
            </p>
          )}
          <h5>Historial de la clienta</h5>
          {data.history.length ? (
            data.history.map((review) => <ReviewItem key={review._id} review={review} canModerate={canModerate} onModerated={load} />)
          ) : (
            <p className="appt-muted">{appointment.customerEmail || appointment.customer ? "No tiene otras reseñas." : "Sin correo ni cuenta, no se puede buscar su historial."}</p>
          )}
          {canModerate ? (
            <p className="appt-muted">
              <Link to="/admin/reviews">Ir a Reseñas →</Link>
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
};

// ---- Vista ----
const AppointmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const baseUrl = getApiBaseUrl();
  const [appointment, setAppointment] = useState(null);
  const [version, setVersion] = useState(0);
  const [specialists, setSpecialists] = useState([]);
  const [services, setServices] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${baseUrl}/api/appointments/${id}`, { headers: headers() });
      setAppointment(data);
      setVersion((v) => v + 1);
      setError("");
    } catch (err) {
      setError(errorOf(err, "No fue posible cargar la cita."));
    }
  }, [baseUrl, id]);

  useEffect(() => {
    load();
    axios
      .get(`${baseUrl}/api/appointments/specialists`, { headers: headers() })
      .then((r) => setSpecialists(r.data?.items || []))
      .catch(() => setSpecialists([]));
    axios
      .get(`${baseUrl}/api/services`, { headers: headers() })
      .then((r) => setServices(r.data?.items || []))
      .catch(() => setServices([]));
  }, [baseUrl, load]);

  // Cambios de fotos / autorización: solo se refresca la cita, sin rearmar el
  // formulario (no se pierde lo que se esté escribiendo).
  const updateMediaOnly = useCallback(
    (updated) => setAppointment((prev) => ({ ...prev, media: updated.media, mediaConsent: updated.mediaConsent })),
    []
  );

  if (error && !appointment) {
    return (
      <section>
        <Alert type="error">{error}</Alert>
        <Link to="/admin/appointment-list">← Volver a Citas</Link>
      </section>
    );
  }
  if (!appointment) return <Loader />;

  return (
    <section className="appt-detail">
      <nav className="appt-detail-nav">
        <button type="button" className="btn-secondary" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/admin/appointment-list"))}>
          ← Volver
        </button>
        <Link to="/admin/appointments">
          <i className="fa-solid fa-calendar-days" aria-hidden="true" /> Agenda
        </Link>
        <Link to="/admin/appointment-list">
          <i className="fa-solid fa-list" aria-hidden="true" /> Citas
        </Link>
      </nav>
      {notice ? <Alert type="success">{notice}</Alert> : null}

      <div className="appt-detail-grid">
        <div className="appt-detail-main">
          <AppointmentDialog
            key={version}
            asPage
            appointment={appointment}
            specialists={specialists}
            services={services}
            onClose={() => navigate("/admin/appointment-list")}
            onSaved={() => {
              setNotice("Cambios guardados.");
              load();
            }}
            onChanged={load}
          />
        </div>
        <aside className="appt-detail-side">
          <AppointmentMedia appointment={appointment} onUpdated={updateMediaOnly} />
          <AppointmentReviews appointment={appointment} />
        </aside>
      </div>
    </section>
  );
};

export default AppointmentDetail;
