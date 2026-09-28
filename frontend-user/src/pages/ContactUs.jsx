// src/pages/ContactUs.jsx — ruta /contacto: canales de contacto (WhatsApp,
// teléfono, correo y redes, del admin) junto al formulario (useContactForm →
// POST /api/mail/send-email), y debajo las preguntas frecuentes del admin
// (StoreConfig.faqs, pestaña "Servicios y precios"). ?motivo=mayoreo (u otra
// clave de CONTACT_REASON_KEYS) preselecciona el motivo del formulario.
import React, { useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { useContactForm, CONTACT_REASONS } from '../hooks/useContactForm';
import { socialHref, telHref } from '../utils/links';
import { sortActive } from '../utils/storeConfigLists';
import './ContactUs.css';

const SOCIAL_NETWORKS = [
  { key: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram' },
  { key: 'facebook', label: 'Facebook', icon: 'fa-brands fa-facebook-f' },
  { key: 'threads', label: 'Threads', icon: 'fa-brands fa-threads' },
];

const ContactChannels = ({ config }) => {
  const email = (config?.contactEmail || '').trim();
  const phone = (config?.contactPhone || '').trim();
  const whatsapp = socialHref('whatsapp', config?.socialLinks?.whatsapp);
  const phoneHref = telHref(phone);
  const socials = SOCIAL_NETWORKS.map((net) => ({ ...net, href: socialHref(net.key, config?.socialLinks?.[net.key]) })).filter(
    (net) => net.href
  );

  const channels = [
    whatsapp && { href: whatsapp, icon: 'fa-brands fa-whatsapp', title: 'WhatsApp', detail: 'Respuesta rápida en horario de oficina', external: true },
    phoneHref && { href: phoneHref, icon: 'fa-solid fa-phone', title: 'Llámanos', detail: phone },
    email && { href: `mailto:${email}`, icon: 'fa-solid fa-envelope', title: 'Escríbenos', detail: email },
  ].filter(Boolean);

  return (
    <>
      {channels.length ? (
        <ul className="contact-channels">
          {channels.map((channel) => (
            <li key={channel.title}>
              <a
                href={channel.href}
                className="contact-channel"
                {...(channel.external ? { target: '_blank', rel: 'noreferrer' } : {})}
              >
                <span className="contact-channel-icon" aria-hidden="true">
                  <i className={channel.icon} />
                </span>
                <span className="contact-channel-body">
                  <strong>{channel.title}</strong>
                  <span>{channel.detail}</span>
                </span>
                <i className="fa-solid fa-arrow-right contact-channel-arrow" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {socials.length ? (
        <div className="contact-socials">
          <span>Síguenos</span>
          {socials.map((net) => (
            <a key={net.key} href={net.href} target="_blank" rel="noreferrer" aria-label={net.label}>
              <i className={net.icon} aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : null}
    </>
  );
};

const ContactForm = ({ initialReason }) => {
  const contact = useContactForm({ initialReason });
  const { form, onChange } = contact;

  if (contact.submitted) {
    return (
      <div className="contact-card contact-sent" role="status">
        <span className="contact-sent-icon" aria-hidden="true">
          <i className="fa-solid fa-check" />
        </span>
        <h2>¡Gracias por escribirnos!</h2>
        <p>
          Recibimos tu mensaje y te responderemos a <strong>{form.email}</strong> lo antes posible.
        </p>
        <button type="button" className="contact-btn contact-btn--ghost" onClick={contact.reset}>
          Enviar otro mensaje
        </button>
      </div>
    );
  }

  return (
    <form className="contact-card contact-form" onSubmit={contact.onSubmit}>
      <h2>Envíanos un mensaje</h2>
      <div className="contact-grid">
        <label className="contact-field" htmlFor="contact-name">
          <span>Nombre completo</span>
          <input id="contact-name" name="fullName" value={form.fullName} onChange={onChange} autoComplete="name" required maxLength={120} />
        </label>
        <label className="contact-field" htmlFor="contact-phone">
          <span>Teléfono (opcional)</span>
          <input id="contact-phone" name="phone" type="tel" inputMode="numeric" value={form.phone} onChange={onChange} autoComplete="tel" maxLength={30} />
        </label>
        <label className="contact-field contact-field--wide" htmlFor="contact-email">
          <span>Correo electrónico</span>
          <input id="contact-email" name="email" type="email" value={form.email} onChange={onChange} autoComplete="email" required />
        </label>
        <label className="contact-field contact-field--wide" htmlFor="contact-reason">
          <span>¿En qué te ayudamos?</span>
          <select id="contact-reason" name="service" value={form.service} onChange={onChange} required>
            <option value="" disabled>
              Elige un motivo
            </option>
            {CONTACT_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </label>
        <label className="contact-field contact-field--wide" htmlFor="contact-message">
          <span>Mensaje</span>
          <textarea
            id="contact-message"
            name="message"
            rows={5}
            value={form.message}
            onChange={onChange}
            minLength={10}
            maxLength={2000}
            required
            placeholder="Cuéntanos qué necesitas: cantidades, presentación, fechas…"
          />
        </label>
      </div>
      {contact.error ? (
        <p className="contact-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          <span>{contact.error}</span>
        </p>
      ) : null}
      <button type="submit" className="contact-btn" disabled={contact.isSubmitting}>
        {contact.isSubmitting ? 'Enviando…' : 'Enviar mensaje'}
      </button>
    </form>
  );
};

const FaqItem = ({ faq }) => {
  const id = useId();
  return (
    <details className="faq-item">
      <summary id={id}>
        <span>{faq.q}</span>
        <i className="fa-solid fa-plus" aria-hidden="true" />
      </summary>
      <p className="faq-answer text-justify" aria-labelledby={id}>
        {faq.a}
      </p>
    </details>
  );
};

const ContactUs = () => {
  usePageMeta(
    'Contacto',
    'Escríbenos por WhatsApp o correo. Pedidos, mayoreo para cafeterías, suscripción o una visita a la finca en Xicotepec.'
  );
  const { config } = useStoreConfig();
  const [searchParams] = useSearchParams();
  const faqs = sortActive(config?.faqs || []).filter((f) => f.q && f.a);

  return (
    <>
      <section className="contact" aria-labelledby="contact-title">
        <div className="contact-intro">
          <h1 id="contact-title" className="contact-title">
            Hablemos de <em>café</em>
          </h1>
          <p className="contact-lead text-justify">
            ¿Tienes dudas sobre un pedido, quieres surtir tu cafetería o visitar la finca en Xicotepec? Escríbenos por el
            medio que prefieras; te responde nuestro equipo, no un robot.
          </p>
          <ContactChannels config={config} />
        </div>
        {/* key: si cambia ?motivo= estando en la página, el formulario se reinicia con él. */}
        <ContactForm key={searchParams.get('motivo') || ''} initialReason={searchParams.get('motivo') || ''} />
      </section>

      {faqs.length ? (
        <section className="faq" aria-labelledby="faq-title">
          <div className="faq-heading">
            <h2 id="faq-title" className="faq-title">
              Preguntas <em>frecuentes</em>
            </h2>
            <p>Lo que más nos preguntan. Si no encuentras tu respuesta, escríbenos.</p>
          </div>
          <div className="faq-list">
            {faqs.map((faq, i) => (
              <FaqItem key={`${i}-${faq.q}`} faq={faq} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
};

export default ContactUs;
