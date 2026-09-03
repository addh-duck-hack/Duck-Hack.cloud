// src/components/ContactUs.jsx — PROPUESTA B
import React, { useState } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { getApiBaseUrl } from '../utils/apiClient';
import { useStoreConfig } from '../hooks/useStoreConfig';
import './ContactUs.css';

const DEFAULT_CONTACT_EMAIL = 'hola@cafetacita.mx';
const DEFAULT_CONTACT_PHONE = '55 1234 5678';
const DEFAULT_ADDRESS = 'Xicotepec de Juárez, Sierra Norte de Puebla';

const REASONS = [
  'Pedido / tienda en línea',
  'Mayoreo y cafeterías',
  'Suscripción mensual',
  'Visita a la finca',
  'Prensa o colaboración',
  'Otro',
];

const ContactUs = () => {
  usePageMeta(
    'Contacto',
    'Escríbenos por WhatsApp o correo. Pedidos, mayoreo para cafeterías, suscripción o una visita a la finca en Xicotepec.'
  );

  const { config } = useStoreConfig();
  const whatsapp = config?.socialLinks?.whatsapp || '';
  const contactEmail = config?.contactEmail || DEFAULT_CONTACT_EMAIL;
  const contactPhoneLabel = config?.contactPhone || DEFAULT_CONTACT_PHONE;
  // "Domicilio legal" configurado en el admin (StoreConfig.legalIdentity.legalAddress).
  const address = config?.legalIdentity?.legalAddress || DEFAULT_ADDRESS;

  const [formData, setFormData] = useState({ fullName: '', email: '', phone: '', service: '', message: '' });
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/mail/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        setFormSubmitted(true);
      } else {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message || 'No pudimos enviar el mensaje. Intenta de nuevo.');
      }
    } catch {
      setError('No pudimos enviar el mensaje. Intenta más tarde.');
    }
  };

  return (
    <section className="contact-view">
      <span className="eyebrow">Escríbenos</span>
      <h1 className="section-title">Cuéntanos qué necesitas</h1>

      <div className="contact-grid">
        <div className="contact-info">
          <p>Respondemos en español, directo desde la finca — sin buzones automáticos.</p>
          {whatsapp && (
            <div className="contact-item">
              <i className="fab fa-whatsapp" aria-hidden="true" />
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp {contactPhoneLabel}</a>
            </div>
          )}
          <div className="contact-item">
            <i className="fas fa-envelope" aria-hidden="true" />
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          </div>
          <div className="contact-item">
            <i className="fas fa-map-marker-alt" aria-hidden="true" />
            <span>{address}</span>
          </div>
        </div>

        {!formSubmitted ? (
          <form className="contact-card" onSubmit={handleSubmit}>
            {error && <div className="contact-error">{error}</div>}
            <div className="field">
              <label htmlFor="fullName">Nombre completo</label>
              <input type="text" id="fullName" name="fullName" value={formData.fullName} onChange={handleChange} required />
            </div>
            <div className="field">
              <label htmlFor="email">Correo electrónico</label>
              <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} required />
            </div>
            <div className="field">
              <label htmlFor="phone">Teléfono (opcional)</label>
              <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} />
            </div>
            <div className="field">
              <label htmlFor="service">Motivo</label>
              <select id="service" name="service" value={formData.service} onChange={handleChange} required>
                <option value="">Selecciona un motivo</option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="message">Mensaje</label>
              <textarea id="message" name="message" value={formData.message} onChange={handleChange} required />
            </div>
            <button type="submit" className="btn btn-solid">Enviar mensaje</button>
          </form>
        ) : (
          <div className="contact-card thank-you">
            <h3>¡Gracias por escribirnos!</h3>
            <p>Recibimos tu mensaje y te respondemos lo antes posible.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default ContactUs;
