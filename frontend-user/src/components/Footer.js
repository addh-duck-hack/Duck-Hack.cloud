// src/components/Footer.js
import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';
import './Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h4>Redes Sociales</h4>
          <div className="social-links">
            <a
              href="https://wa.me/5215661653418?text=Hola,%20estoy%20visitando%20su%20sitio%20web%20y%20me%20gustaría%20obtener%20más%20información%20sobre%20sus%20servicios."
              target="_blank"
              rel="noopener noreferrer"
              className="social-link"
              aria-label="WhatsApp"
            >
              <i className="fab fa-whatsapp"></i>
            </a>
            <a
              href="https://www.instagram.com/duckhack.cloud/"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link"
              aria-label="Instagram"
            >
              <i className="fab fa-instagram"></i>
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=61593021786500"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link"
              aria-label="Facebook"
            >
              <i className="fab fa-facebook-f"></i>
            </a>
            <a
              href="https://www.threads.com/@duckhack.cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link"
              aria-label="Threads"
            >
              <i className="fab fa-threads"></i>
            </a>
          </div>
        </div>

        <div className="footer-section">
          <h4>Contacto</h4>
          <p>
            <a href="mailto:redes.sociales@duck-hack.com">redes.sociales@duck-hack.com</a>
          </p>
          <p>
            <a href="tel:+525661653418">+52 566-165-3418</a>
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
          <img src={logo} alt="Duck-Hack" className="footer-logo" />
        </div>
      </div>

      <hr className="footer-separator" />

      <div className="footer-bottom">
        <p>© {currentYear} — Designed by Duck-Hack</p>
      </div>
    </footer>
  );
};

export default Footer;
