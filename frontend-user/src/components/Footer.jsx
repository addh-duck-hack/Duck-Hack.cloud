// src/components/Footer.js
import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';
import { useStoreConfig, resolveStoreImageUrl } from '../hooks/useStoreConfig';
import './Footer.css';

const DEFAULT_SOCIAL_LINKS = {
  whatsapp:
    'https://wa.me/5215661653418?text=Hola,%20estoy%20visitando%20su%20sitio%20web%20y%20me%20gustaría%20obtener%20más%20información%20sobre%20sus%20servicios.',
  instagram: 'https://www.instagram.com/duckhack.cloud/',
  facebook: 'https://www.facebook.com/profile.php?id=61593021786500',
  threads: 'https://www.threads.com/@duckhack.cloud',
};
const DEFAULT_CONTACT_EMAIL = 'redes.sociales@duck-hack.com';
const DEFAULT_CONTACT_PHONE = '+52 566-165-3418';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const { config } = useStoreConfig();

  const social = {
    whatsapp: config?.socialLinks?.whatsapp || DEFAULT_SOCIAL_LINKS.whatsapp,
    instagram: config?.socialLinks?.instagram || DEFAULT_SOCIAL_LINKS.instagram,
    facebook: config?.socialLinks?.facebook || DEFAULT_SOCIAL_LINKS.facebook,
    threads: config?.socialLinks?.threads || DEFAULT_SOCIAL_LINKS.threads,
  };
  const contactEmail = config?.contactEmail || DEFAULT_CONTACT_EMAIL;
  const contactPhone = config?.contactPhone || DEFAULT_CONTACT_PHONE;
  const contactPhoneHref = contactPhone.replace(/[^\d+]/g, '');
  const logoSrc = resolveStoreImageUrl(config?.logoUrl) || logo;
  const brandName = config?.storeName || 'Duck-Hack';

  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h4>Redes Sociales</h4>
          <div className="social-links">
            <a href={social.whatsapp} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="WhatsApp">
              <i className="fab fa-whatsapp"></i>
            </a>
            <a href={social.instagram} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Instagram">
              <i className="fab fa-instagram"></i>
            </a>
            <a href={social.facebook} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Facebook">
              <i className="fab fa-facebook-f"></i>
            </a>
            <a href={social.threads} target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Threads">
              <i className="fab fa-threads"></i>
            </a>
          </div>
        </div>

        <div className="footer-section">
          <h4>Contacto</h4>
          <p>
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          </p>
          <p>
            <a href={`tel:${contactPhoneHref}`}>{contactPhone}</a>
          </p>
        </div>

        <div className="footer-section">
          <h4>Legales</h4>
          <p>
            <Link to="/legal-notice">Aviso Legal</Link>
          </p>
          <p>
            <Link to="/privacy-policy">Aviso de Privacidad</Link>
          </p>
        </div>

        <div className="footer-section footer-brand">
          <img src={logoSrc} alt={brandName} className="footer-logo" />
        </div>
      </div>

      <hr className="footer-separator" />

      <div className="footer-bottom">
        <p>© {currentYear} — Designed by {brandName}</p>
      </div>
    </footer>
  );
};

export default Footer;
