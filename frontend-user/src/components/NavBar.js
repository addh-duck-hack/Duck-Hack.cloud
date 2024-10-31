// src/components/NavBar.js
import React, { useState } from 'react';
import logo from '../assets/logo.png';
import './NavBar.css';

const NavBar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <nav className="navbar">
      {/* Logo y nombre */}
      <div className="navbar-left">
        <a href="/" className="navbar-logo-container">
          <img src={logo} alt="Duck-Hack Logo" className="navbar-logo" />
          <span className="brand-name">Duck-Hack</span>
        </a>
      </div>

      {/* Opciones de menú centradas */}
      <div className="navbar-center">
        <ul className="nav-links">
          <li><a href="#about-us">Nosotros</a></li>
          <li><a href="#services">Servicios</a></li>
          <li><a href="#customers">Clientes</a></li>
          <li><a href="#contact-us">Contacto</a></li>
        </ul>
      </div>

      {/* Redes sociales a la derecha */}
      <div className="navbar-right">
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

      {/* Menú hamburguesa para móviles */}
      <div className="hamburger-menu" onClick={toggleMenu}>
        <i className={`fas ${isMenuOpen ? 'fa-times' : 'fa-bars'}`}></i>
      </div>

      {/* Menú desplegable para móviles */}
      <div className={`menu-overlay ${isMenuOpen ? 'active' : ''}`}>
        <ul className="nav-links">
        <li><a href="#about-us">Nosotros</a></li>
          <li><a href="#services">Servicios</a></li>
          <li><a href="#customers">Clientes</a></li>
          <li><a href="#contact-us">Contacto</a></li>
        </ul>

        <hr className="menu-separator" />

        <div className="social-links">
          <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="social-link">
            <i className="fab fa-facebook-f"></i>
          </a>
          <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="social-link">
            <i className="fab fa-instagram"></i>
          </a>
          <a href="https://wa.me/5217202586341?text=Hola,%20estoy%20visitando%20su%20sitio%20web%20y%20me%20gustaría%20obtener%20más%20información%20sobre%20sus%20servicios." target="_blank" rel="noopener noreferrer" className="social-link">
            <i className="fab fa-whatsapp"></i>
          </a>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;