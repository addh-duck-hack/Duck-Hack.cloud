// src/components/Footer.jsx — PROPUESTA B
import React from 'react';
import { Link } from 'react-router-dom';
import { useStoreConfig } from '../hooks/useStoreConfig';
import './Footer.css';

const DEFAULT_CONTACT_EMAIL = 'hola@cafetacita.mx';
const DEFAULT_CONTACT_PHONE = '55 1234 5678';
const DEFAULT_LOCATION = 'Xicotepec de Juárez, Puebla';

const SOCIAL_ICONS = {
  whatsapp: 'fab fa-whatsapp',
  instagram: 'fab fa-instagram',
  facebook: 'fab fa-facebook-f',
  threads: 'fab fa-threads',
  tiktok: 'fab fa-tiktok',
};

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const { config } = useStoreConfig();

  const brandName = config?.storeName || 'Café Tacita';
  const contactEmail = config?.contactEmail || DEFAULT_CONTACT_EMAIL;
  const contactPhone = config?.contactPhone || DEFAULT_CONTACT_PHONE;
  const contactPhoneHref = contactPhone.replace(/[^\d+]/g, '');
  const location = config?.legalIdentity?.legalAddress || DEFAULT_LOCATION;

  // Solo se muestran las redes que el admin realmente cargó — sin defaults
  // hardcodeados (Café Tacita todavía no define sus redes).
  const socialEntries = Object.entries(config?.socialLinks || {}).filter(
    ([key, url]) => url && SOCIAL_ICONS[key]
  );

  return (
    <footer className="foot">
      <div className="foot-inner">
        <div className="foot-brand">
          <span className="script">{brandName} · de Sutu Cha'Nu</span>
          <p className="foot-lines">
            {location}
            <br />
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a> · <a href={`tel:${contactPhoneHref}`}>{contactPhone}</a>
          </p>
        </div>

        <div className="foot-cols">
          <div className="foot-col">
            <h4>Tienda</h4>
            <Link to="/tienda">Catálogo</Link>
            <Link to="/precios">Presentaciones</Link>
            <Link to="/carrito">Canasta</Link>
          </div>
          <div className="foot-col">
            <h4>La finca</h4>
            <Link to="/servicios">El proceso</Link>
            <Link to="/nosotros">Nuestra raíz</Link>
            <Link to="/clientes">Cafeterías</Link>
          </div>
          <div className="foot-col">
            <h4>Legales</h4>
            <Link to="/legal-notice">Aviso Legal</Link>
            <Link to="/privacy-policy">Aviso de Privacidad</Link>
            <Link to="/contacto">Contacto</Link>
          </div>
        </div>
      </div>

      {socialEntries.length > 0 && (
        <div className="foot-social">
          {socialEntries.map(([key, url]) => (
            <a key={key} href={url} target="_blank" rel="noopener noreferrer" aria-label={key}>
              <i className={SOCIAL_ICONS[key]} aria-hidden="true" />
            </a>
          ))}
        </div>
      )}

      <div className="foot-bottom">
        <span>© {currentYear} {brandName} — Xicotepec de Juárez, Puebla</span>
      </div>
    </footer>
  );
};

export default Footer;
