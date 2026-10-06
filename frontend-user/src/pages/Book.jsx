// src/pages/Book.jsx — agendar en línea: servicios → especialista → día y
// hora → datos. POST /api/appointments/public (con sesión la cita queda en la
// cuenta y suma sellos de lealtad al completarse). Al terminar lleva a la
// página de la cita con su token, igual que el enlace del correo.
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getAuthHeader, useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import SlotPicker from '../ui/SlotPicker';
import { Loading, Notice, PageTitle } from '../ui/bits';
import { apiFetch } from '../utils/apiClient';
import { EMAIL_REGEX, errorText, fmtDate, fmtDuration, fmtTime, money } from '../utils/format';
import { listItems } from '../utils/products';
import { rememberAppointmentToken } from './Appointment';

const MAX_SERVICES = 5;

const Book = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const settings = useApi('/api/appointments/settings/public').data || {};
  const servicesState = useApi('/api/services/public?bookable=true');
  const services = listItems(servicesState.data);
  const loyalty = useApi(isAuthenticated ? '/api/loyalty/me' : null, getAuthHeader()).data;

  const [selected, setSelected] = useState(() => (params.get('servicio') ? [params.get('servicio')] : []));
  const [specialist, setSpecialist] = useState('any');
  const [slot, setSlot] = useState(null);
  const [quote, setQuote] = useState(null);
  const [form, setForm] = useState({ customerName: '', customerEmail: '', customerPhone: '', notes: '' });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setForm((f) => ({ ...f, customerName: f.customerName || user?.name || '', customerEmail: f.customerEmail || user?.email || '', customerPhone: f.customerPhone || user?.phone || '' }));
    }
  }, [isAuthenticated, user]);

  const ids = useMemo(() => services.filter((s) => selected.includes(s._id)).map((s) => s._id), [services, selected]);
  const specialistsState = useApi(ids.length ? `/api/appointments/specialists/public?services=${ids.join(',')}` : null);
  const specialists = listItems(specialistsState.data);
  const allowAny = settings.allowAnySpecialist !== false;

  // Si cambia la lista y la elegida ya no hace esos servicios, se reinicia.
  useEffect(() => {
    if (specialist !== 'any' && specialistsState.data && !specialists.some((s) => s._id === specialist)) setSpecialist(allowAny ? 'any' : '');
    if (!allowAny && specialist === 'any' && specialists.length) setSpecialist(specialists[0]._id);
  }, [specialistsState.data, specialists, specialist, allowAny]);

  const toggleService = (id) => {
    setError('');
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_SERVICES ? prev : [...prev, id]));
  };

  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!ids.length) return setError('Elige al menos un servicio.');
    if (!slot) return setError('Elige el día y la hora.');
    if (!form.customerName.trim()) return setError('Escribe tu nombre.');
    if (!EMAIL_REGEX.test(form.customerEmail.trim())) return setError('Escribe un correo válido.');
    if (form.customerPhone.replace(/\D/g, '').length < 10) return setError('Escribe un teléfono de 10 dígitos.');
    setSending(true);
    try {
      const data = await apiFetch('/api/appointments/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ services: ids, specialist: specialist || 'any', start: slot.start, ...form, notes: form.notes || undefined }),
      });
      rememberAppointmentToken(data.appointment._id, data.appointmentAccessToken);
      navigate(`/cita/${data.appointment._id}?nueva=${data.appointment.status === 'pending_deposit' ? 'anticipo' : '1'}`);
    } catch (err) {
      if (err.code === 'SLOT_TAKEN') setSlot(null);
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const stamps = loyalty?.programs?.stamps;

  return (
    <div className="wrap narrow">
      <PageTitle title="Agendar cita" subtitle="Elige tus servicios, con quién y cuándo." />
      <form className="book" onSubmit={submit}>
        <fieldset className="card step">
          <legend>1. Servicios</legend>
          {servicesState.isLoading ? <Loading /> : null}
          {!servicesState.isLoading && !services.length ? <p className="muted">Por ahora no hay servicios para agendar en línea.</p> : null}
          <div className="check-list">
            {services.map((s) => (
              <label key={s._id} className={`check-row ${selected.includes(s._id) ? 'is-active' : ''}`}>
                <input type="checkbox" checked={selected.includes(s._id)} onChange={() => toggleService(s._id)} />
                <span className="check-row__name">
                  {s.name}
                  {s.category?.name ? <small className="muted"> · {s.category.name}</small> : null}
                </span>
                <span className="muted">{fmtDuration(s.durationMin)}</span>
                <strong>{s.priceFrom ? 'Desde ' : ''}{money(s.price)}</strong>
              </label>
            ))}
          </div>
          {selected.length >= MAX_SERVICES ? <small className="muted">Hasta {MAX_SERVICES} servicios por cita.</small> : null}
        </fieldset>

        <fieldset className="card step" disabled={!ids.length}>
          <legend>2. Especialista</legend>
          <div className="chips">
            {allowAny ? (
              <button type="button" className={`chip ${specialist === 'any' ? 'is-active' : ''}`} onClick={() => setSpecialist('any')}>
                Cualquiera disponible
              </button>
            ) : null}
            {specialists.map((s) => (
              <button type="button" key={s._id} className={`chip ${specialist === s._id ? 'is-active' : ''}`} onClick={() => setSpecialist(s._id)}>
                {s.name}
              </button>
            ))}
          </div>
          {ids.length && specialistsState.data && !specialists.length ? <p className="muted">Ninguna especialista hace todos esos servicios juntos; prueba agendarlos por separado.</p> : null}
        </fieldset>

        <fieldset className="card step" disabled={!ids.length}>
          <legend>3. Día y hora</legend>
          <SlotPicker
            serviceIds={ids}
            specialist={specialist}
            maxDaysAhead={settings.maxDaysAhead}
            timezone={settings.timezone}
            value={slot}
            onChange={setSlot}
            onQuote={setQuote}
          />
        </fieldset>

        <fieldset className="card step">
          <legend>4. Tus datos</legend>
          <div className="form-grid">
            <label>Nombre<input name="customerName" value={form.customerName} onChange={onField} autoComplete="name" /></label>
            <label>Correo<input name="customerEmail" type="email" value={form.customerEmail} onChange={onField} autoComplete="email" /></label>
            <label>Teléfono (10 dígitos)<input name="customerPhone" type="tel" value={form.customerPhone} onChange={onField} autoComplete="tel" /></label>
            <label className="wide">Notas (opcional)<textarea name="notes" rows="2" maxLength={500} value={form.notes} onChange={onField} placeholder="Alergias, referencias de lo que buscas…" /></label>
          </div>
          {!isAuthenticated ? <p className="muted small">¿Tienes cuenta? <Link to="/login?volver=/agendar">Inicia sesión</Link> para ver tus citas y juntar sellos.</p> : null}
        </fieldset>

        <aside className="card summary">
          <h2>Resumen</h2>
          {slot ? <p><i className="fa-regular fa-calendar" aria-hidden="true" /> {fmtDate(slot.start, settings.timezone)} a las {fmtTime(slot.start, settings.timezone)}</p> : <p className="muted">Sin horario elegido.</p>}
          {quote ? <p>Duración: {fmtDuration(quote.durationMin)} · Total estimado: <strong>{money(quote.total)}</strong></p> : null}
          {quote?.depositAmount ? (
            <p className="loyalty-hint">
              <i className="fa-solid fa-money-bill-transfer" aria-hidden="true" /> Estos servicios piden un anticipo de {money(quote.depositAmount)} por
              transferencia (o con tarjeta de regalo) para confirmar la cita; el resto se paga en el salón.
            </p>
          ) : null}
          {stamps?.enabled ? <p className="loyalty-hint"><i className="fa-solid fa-stamp" aria-hidden="true" /> Esta cita suma un sello: al juntar {stamps.goal} ganas {stamps.reward}.</p> : null}
          <Notice type="error">{error}</Notice>
          <button type="submit" className="btn btn--block" disabled={sending}>{sending ? 'Agendando…' : 'Confirmar cita'}</button>
          <small className="muted">{quote?.depositAmount ? "Te mandamos por correo los datos para el anticipo." : "El pago se hace en el salón. Te mandamos la confirmación por correo."}</small>
        </aside>
      </form>
    </div>
  );
};

export default Book;
