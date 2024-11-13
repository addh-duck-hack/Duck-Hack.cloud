import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Link as ScrollLink, animateScroll as scroll } from 'react-scroll';
import logo from '../assets/logo.png';
import './NavBar.css';

const NavBar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleScrollToSection = (section) => {
    if (location.pathname !== "/") {
      window.location.href = `/#${section}`;
    } else {
      scroll.scrollTo(document.getElementById(section).offsetTop, { smooth: true });
    }
  };

  return (
    <nav className="navbar">
      {/* Logo y nombre */}
      <div className="navbar-left">
        <Link to="/" className="navbar-logo-container" onClick={() => scroll.scrollToTop()}>
          <img src={logo} alt="Duck-Hack Logo" className="navbar-logo" />
          <span className="brand-name">Duck-Hack</span>
        </Link>
      </div>

      {/* Opciones de menú centradas */}
      <div className="navbar-center">
        <ul className="nav-links">
          <li><ScrollLink to="about-us" smooth={true} offset={-70} onClick={() => handleScrollToSection("about-us")}>Nosotros</ScrollLink></li>
          <li><ScrollLink to="services" smooth={true} offset={-70} onClick={() => handleScrollToSection("services")}>Servicios</ScrollLink></li>
          <li><ScrollLink to="customers" smooth={true} offset={-70} onClick={() => handleScrollToSection("customers")}>Clientes</ScrollLink></li>
          <li><ScrollLink to="contact-us" smooth={true} offset={-70} onClick={() => handleScrollToSection("contact-us")}>Contacto</ScrollLink></li>
        </ul>
      </div>

      {/* Redes sociales a la derecha */}
      <div className="navbar-right">
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
          <li><ScrollLink to="about-us" smooth={true} offset={-70} onClick={() => handleScrollToSection("about-us")}>Nosotros</ScrollLink></li>
          <li><ScrollLink to="services" smooth={true} offset={-70} onClick={() => handleScrollToSection("services")}>Servicios</ScrollLink></li>
          <li><ScrollLink to="customers" smooth={true} offset={-70} onClick={() => handleScrollToSection("customers")}>Clientes</ScrollLink></li>
          <li><ScrollLink to="contact-us" smooth={true} offset={-70} onClick={() => handleScrollToSection("contact-us")}>Contacto</ScrollLink></li>
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
