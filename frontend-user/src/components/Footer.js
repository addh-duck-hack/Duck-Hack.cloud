// src/components/Footer.js
import React from 'react';
import './Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h4>Contacto:</h4>
          <p>Email: <a href="mailto:contacto@duck-hack.com">contacto@duck-hack.com</a></p>
          <p>Teléfono: <a href="tel:+527202586341">+52 720-258-6341</a></p>
        </div>
        
        <div className="footer-section">
          <h4>Redes Sociales:</h4>
          <div className="social-links">
            {/*<a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="social-link">
              <i className="fab fa-facebook-f"></i>
            </a>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="social-link">
              <i className="fab fa-instagram"></i>
            </a>*/}
            <a href="https://wa.me/5217202586341?text=Hola,%20estoy%20visitando%20su%20sitio%20web%20y%20me%20gustaría%20obtener%20más%20información%20sobre%20sus%20servicios." target="_blank" rel="noopener noreferrer" className="social-link">
              <i className="fab fa-whatsapp"></i>
            </a>
          </div>
        </div>
      </div>

      <hr className="footer-separator" />
      
      <div className="footer-bottom">
        <p>©{currentYear} - Designed by Duck-Hack</p>
      </div>
    </footer>
  );
};

export default Footer;
