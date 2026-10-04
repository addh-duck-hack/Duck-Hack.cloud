// src/pages/Info.jsx — contacto (POST /api/mail/send-email), textos legales
// de StoreConfig y página no encontrada.
import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { HoursList } from '../ui/Layout';
import RichText from '../ui/RichText';
import { Notice, PageTitle } from '../ui/bits';
import { apiFetch } from '../utils/apiClient';
import { errorText } from '../utils/format';

export const Contact = () => {
  const { config } = useStoreConfig();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', service: 'Citas', message: '' });
  const [msg, setMsg] = useState({ type: 'info', text: '' });
  const [busy, setBusy] = useState(false);
  const onField = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await apiFetch('/api/mail/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, phone: form.phone || undefined }),
      });
      setMsg({ type: 'success', text: data.message || 'Gracias, te respondemos pronto.' });
      setForm({ ...form, message: '' });
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap">
      <PageTitle title="Contacto" subtitle="¿Dudas sobre un servicio o un pedido? Escríbenos." />
      <div className="grid grid--2">
        <form className="card stack" onSubmit={submit}>
          <label>Nombre<input name="fullName" value={form.fullName} onChange={onField} required /></label>
          <label>Correo<input name="email" type="email" value={form.email} onChange={onField} required /></label>
          <label>Teléfono (opcional)<input name="phone" type="tel" value={form.phone} onChange={onField} /></label>
          <label>Tema
            <select name="service" value={form.service} onChange={onField}>
              <option>Citas</option>
              <option>Tienda</option>
              <option>Otro</option>
            </select>
          </label>
          <label>Mensaje<textarea name="message" rows="4" value={form.message} onChange={onField} required /></label>
          <Notice type={msg.type}>{msg.text}</Notice>
          <button className="btn" disabled={busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
        </form>
        <section className="card">
          {config?.location?.address ? <p><i className="fa-solid fa-location-dot" aria-hidden="true" /> {config.location.address}</p> : null}
          {config?.contactPhone ? <p><i className="fa-solid fa-phone" aria-hidden="true" /> <a href={`tel:${config.contactPhone}`}>{config.contactPhone}</a></p> : null}
          {config?.contactEmail ? <p><i className="fa-regular fa-envelope" aria-hidden="true" /> <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a></p> : null}
          <h3>Horario</h3>
          <HoursList hours={config?.businessHours} />
          {config?.holidays?.length ? (
            <>
              <h3>Días cerrados</h3>
              <ul className="plain">
                {config.holidays.map((h) => <li key={h.date}>{String(h.date).slice(0, 10)}{h.label ? ` · ${h.label}` : ''}</li>)}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
};

const LEGAL = {
  privacidad: ['Aviso de privacidad', 'privacyNotice'],
  aviso: ['Aviso legal', 'legalNotice'],
  devoluciones: ['Cambios y devoluciones', 'returnsPolicy'],
};

export const Legal = () => {
  const { page } = useParams();
  const { config } = useStoreConfig();
  const [title, field] = LEGAL[page] || [];
  if (!title) return <NotFound />;
  return (
    <div className="wrap narrow">
      <PageTitle title={title} />
      {config?.[field] ? <RichText html={config[field]} allowLinks className="legal" /> : <p className="muted">Pronto publicaremos este texto.</p>}
    </div>
  );
};

export const NotFound = () => (
  <div className="wrap narrow">
    <PageTitle title="No encontramos esta página" />
    <Link className="btn" to="/">Ir al inicio</Link>
  </div>
);
