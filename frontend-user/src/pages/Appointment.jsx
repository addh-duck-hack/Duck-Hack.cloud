// src/pages/Appointment.jsx — página de una cita: FRONTEND_URL/cita/<id>?token=…
// Es el enlace de todos los correos de la agenda:
//   - confirmación / reprogramación / cancelación,
//   - recordatorio (&accion=confirmar → botón "Confirmo que asisto"),
//   - reseña post-cita (&accion=calificar → estrellas + comentario).
// Acceso: el token de la cita (header X-Appointment-Token, sirve sin cuenta)
// o la sesión de la dueña. El token se guarda en sessionStorage y se quita de
// la barra de direcciones.
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getAuthHeader } from '../hooks/useAuth';
import SlotPicker from '../ui/SlotPicker';
import { Loading, Notice, StarInput, Stars } from '../ui/bits';
import { apiFetch } from '../utils/apiClient';
import { APPOINTMENT_STATUS, errorText, fmtDate, fmtDuration, fmtTime, folio, money } from '../utils/format';

const tokenKey = (id) => `salon.appointment-token.${id}`;

export const rememberAppointmentToken = (id, token) => {
  if (!id || !token) return;
  try {
    sessionStorage.setItem(tokenKey(id), token);
  } catch {
    // sin almacenamiento
  }
};

const readToken = (id) => {
  try {
    return sessionStorage.getItem(tokenKey(id)) || '';
  } catch {
    return '';
  }
};

const ReviewBox = ({ appointmentId, headers, highlight }) => {
  const [state, setState] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiFetch(`/api/reviews/appointment/${appointmentId}`, { headers: headers() })
      .then(setState)
      .catch(() => setState(null));
  }, [appointmentId, headers]);

  if (!state) return null;
  if (state.review) {
    return (
      <section className="card">
        <h2>Tu calificación</h2>
        <Stars value={state.review.rating} />
        {state.review.comment ? <p>{state.review.comment}</p> : null}
        <small className="muted">{state.review.status === 'approved' ? 'Publicada. ¡Gracias!' : 'Gracias, la revisamos antes de publicarla.'}</small>
      </section>
    );
  }
  if (!state.canReview) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError('Elige de 1 a 5 estrellas.');
    setSending(true);
    setError('');
    try {
      const data = await apiFetch('/api/reviews/appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ appointment: appointmentId, rating, comment: comment.trim() || undefined }),
      });
      setDone(data.message || '¡Gracias por tu calificación!');
      setState({ canReview: false, review: data.review });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={`card ${highlight ? 'card--highlight' : ''}`} id="calificar">
      <h2>¿Cómo te fue?</h2>
      <form onSubmit={submit} className="stack">
        <StarInput value={rating} onChange={setRating} />
        <label>Comentario (opcional)<textarea rows="3" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        <Notice type="error">{error}</Notice>
        <Notice type="success">{done}</Notice>
        <button className="btn" disabled={sending}>{sending ? 'Enviando…' : 'Enviar calificación'}</button>
      </form>
    </section>
  );
};

const Appointment = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const action = params.get('accion');
  const [token, setToken] = useState(() => {
    const fromUrl = params.get('token') || '';
    if (fromUrl) rememberAppointmentToken(id, fromUrl);
    return fromUrl || readToken(id);
  });
  const [appointment, setAppointment] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState(params.get('nueva') ? '¡Listo! Tu cita quedó agendada. Te mandamos los detalles por correo.' : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(''); // '' | 'cancel' | 'reschedule'
  const [reason, setReason] = useState('');
  const [newSlot, setNewSlot] = useState(null);

  // Quitar el token de la URL (no queda en el historial ni al compartir).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('token') || url.searchParams.has('nueva')) {
      url.searchParams.delete('token');
      url.searchParams.delete('nueva');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const headers = useCallback(() => (token ? { 'X-Appointment-Token': token } : getAuthHeader()), [token]);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/appointments/public/${id}`, { headers: headers() });
      setAppointment(data.appointment);
      setLoadError('');
    } catch (err) {
      setLoadError(
        [401, 403].includes(err.status)
          ? 'Este enlace ya no es válido. Si tienes cuenta, inicia sesión para ver tus citas.'
          : err.status === 404
            ? 'No encontramos esta cita.'
            : errorText(err)
      );
    } finally {
      setIsLoading(false);
    }
  }, [id, headers]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (path, body, okMessage) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await apiFetch(`/api/appointments/public/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify(body || {}),
      });
      if (data.appointmentAccessToken) {
        rememberAppointmentToken(id, data.appointmentAccessToken);
        setToken(data.appointmentAccessToken);
      }
      if (data.appointment) setAppointment(data.appointment);
      else await load();
      setMessage(data.message || okMessage);
      setMode('');
      setNewSlot(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <div className="wrap narrow"><Loading /></div>;
  if (loadError) {
    return (
      <div className="wrap narrow">
        <Notice type="error">{loadError}</Notice>
        <Link className="btn" to="/login">Iniciar sesión</Link>
      </div>
    );
  }

  const a = appointment;
  const tz = a.timezone;
  const upcoming = ['pending', 'confirmed'].includes(a.status) && new Date(a.start) > new Date();

  return (
    <div className="wrap narrow">
      <header className="page-title">
        <h1>Cita {folio('CITA', a.appointmentNumber)}</h1>
        <span className={`status status--${a.status}`}>{APPOINTMENT_STATUS[a.status] || a.status}</span>
      </header>
      <Notice type="success">{message}</Notice>
      <Notice type="error">{error}</Notice>

      <section className="card">
        <p className="big"><i className="fa-regular fa-calendar" aria-hidden="true" /> {fmtDate(a.start, tz)}</p>
        <p>{fmtTime(a.start, tz)} – {fmtTime(a.end, tz)} ({fmtDuration(a.durationMin)}){a.specialist?.name ? ` · con ${a.specialist.name}` : ''}</p>
        <ul className="lines">
          {a.services.map((s) => (
            <li key={s.service}><span>{s.name}</span><span>{money(s.price)}</span></li>
          ))}
          <li className="total"><span>Total</span><span>{money(a.total)}</span></li>
        </ul>
        {a.attendanceConfirmedAt ? <p className="ok"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Confirmaste tu asistencia.</p> : null}
      </section>

      {upcoming && !a.attendanceConfirmedAt ? (
        <section className={`card ${action === 'confirmar' ? 'card--highlight' : ''}`}>
          <h2>¿Nos vemos?</h2>
          <p className="muted">Avísanos que sí vienes para apartar tu lugar.</p>
          <button className="btn" disabled={busy} onClick={() => post('confirm-attendance', null, 'Gracias, confirmaste tu asistencia.')}>
            Confirmo que asisto
          </button>
        </section>
      ) : null}

      {upcoming ? (
        <section className="card">
          <h2>¿Cambio de planes?</h2>
          {a.canChange ? (
            <>
              <div className="row">
                <button className="btn btn--ghost" onClick={() => setMode(mode === 'reschedule' ? '' : 'reschedule')}>Reprogramar</button>
                <button className="btn btn--ghost btn--danger" onClick={() => setMode(mode === 'cancel' ? '' : 'cancel')}>Cancelar cita</button>
              </div>
              {mode === 'cancel' ? (
                <div className="stack">
                  <label>Motivo (opcional)<input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></label>
                  <button className="btn btn--danger" disabled={busy} onClick={() => post('cancel', { reason: reason || undefined }, 'Tu cita se canceló.')}>
                    Sí, cancelar
                  </button>
                </div>
              ) : null}
              {mode === 'reschedule' ? (
                <div className="stack">
                  <SlotPicker
                    serviceIds={a.services.map((s) => s.service)}
                    specialist={a.specialist?._id || 'any'}
                    timezone={tz}
                    value={newSlot}
                    onChange={setNewSlot}
                  />
                  <button className="btn" disabled={!newSlot || busy} onClick={() => post('reschedule', { start: newSlot.start }, 'Reprogramamos tu cita.')}>
                    {newSlot ? `Cambiar al ${fmtDate(newSlot.start, tz)} a las ${newSlot.time}` : 'Elige un nuevo horario'}
                  </button>
                </div>
              ) : null}
              {a.changeDeadline ? <small className="muted">Puedes cambiarla hasta el {fmtDate(a.changeDeadline, tz)} a las {fmtTime(a.changeDeadline, tz)}</small> : null}
            </>
          ) : (
            <p className="muted">Ya no se puede cambiar en línea; llámanos o escríbenos por WhatsApp.</p>
          )}
        </section>
      ) : null}

      {a.status === 'completed' ? <ReviewBox appointmentId={id} headers={headers} highlight={action === 'calificar'} /> : null}

      <p><Link to="/agendar">Agendar otra cita →</Link></p>
    </div>
  );
};

export default Appointment;
