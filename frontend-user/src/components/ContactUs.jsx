// src/components/ContactUs.js
import React, { useMemo, useState } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { getApiBaseUrl } from '../utils/apiClient';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { pickList } from '../utils/storeConfigLists';
import { FALLBACK_SERVICES } from './OurServices';
import './ContactUs.css';

const DEFAULT_WHATSAPP =
  'https://wa.me/5215661653418?text=Hola,%20estoy%20visitando%20su%20sitio%20web%20y%20me%20gustaría%20obtener%20más%20información%20sobre%20sus%20servicios.';
const DEFAULT_CONTACT_EMAIL = 'redes.sociales@duck-hack.com';
const DEFAULT_CONTACT_PHONE_LABEL = '+52 566 165 3418';

const ContactUs = () => {
  usePageMeta(
    'Contacto',
    'Contáctanos por WhatsApp o correo electrónico. Respondemos en español, directo desde nuestro equipo.'
  );

  const { config } = useStoreConfig();
  const whatsapp = config?.socialLinks?.whatsapp || DEFAULT_WHATSAPP;
  const contactEmail = config?.contactEmail || DEFAULT_CONTACT_EMAIL;
  const contactPhoneLabel = config?.contactPhone || DEFAULT_CONTACT_PHONE_LABEL;
  // El dropdown de servicios se deriva de la misma fuente que /servicios en
  // vez de mantener su propia lista duplicada.
  const services = useMemo(
    () => pickList(config?.services, FALLBACK_SERVICES).map((s) => s.title),
    [config]
  );

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    service: '',
    message: '',
  });
  const [formSubmitted, setFormSubmitted] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/mail/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        setFormSubmitted(true);
      } else {
        const payload = await response.json().catch(() => null);
        alert(payload?.error?.message || 'Error enviando el mensaje');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error enviando el mensaje. Intenta nuevamente más tarde.');
    }
  };

  return (
    <section className="contact-view">
      <span className="eyebrow">/contacto</span>
      <h1 className="section-title">Cuéntanos qué necesitas</h1>

      <div className="contact-grid">
        <div className="contact-info">
          <p>Respondemos en español, directo desde nuestro equipo — sin buzones automáticos.</p>
          <div className="contact-item">
            <i className="fab fa-whatsapp" />
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              WhatsApp {contactPhoneLabel}
            </a>
          </div>
          <div className="contact-item">
            <i className="fas fa-envelope" />
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          </div>
        </div>

        {!formSubmitted ? (
          <form className="card" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="fullName">Nombre completo</label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="email">Correo electrónico</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="phone">Teléfono (opcional)</label>
              <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} />
            </div>
            <div className="field">
              <label htmlFor="service">Servicio</label>
              <select id="service" name="service" value={formData.service} onChange={handleChange} required>
                <option value="">Selecciona un servicio</option>
                {services.map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="message">Mensaje</label>
              <textarea id="message" name="message" value={formData.message} onChange={handleChange} required />
            </div>
            <button type="submit" className="btn btn-solid">
              ./enviar-mensaje
            </button>
          </form>
        ) : (
          <div className="card thank-you">
            <h3>¡Gracias por contactarnos!</h3>
            <p>Hemos recibido tu mensaje y te responderemos lo antes posible.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default ContactUs;
