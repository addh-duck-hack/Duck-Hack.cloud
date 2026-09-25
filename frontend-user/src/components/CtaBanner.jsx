// src/components/CtaBanner.jsx
//
// Llamado a la acción común a todas las páginas, justo antes del footer
// (montado en AppShell): frase con la segunda parte en cursiva y acento,
// subtítulo y dos botones (tienda y contacto). Texto fijo.
import React from 'react';
import { Link } from 'react-router-dom';
import './CtaBanner.css';

const CtaBanner = () => (
  <section className="cta-banner" aria-labelledby="cta-banner-title">
    <h2 id="cta-banner-title" className="cta-banner-title">
      La vida sin café <em>sería un error</em>
    </h2>
    <p className="cta-banner-lead">El sabor de un café de altura</p>
    <div className="cta-banner-actions">
      <Link to="/tienda" className="cta-banner-btn cta-banner-btn--solid">
        Visita nuestra tienda
      </Link>
      <Link to="/contacto" className="cta-banner-btn cta-banner-btn--outline">
        Contáctanos
      </Link>
    </div>
  </section>
);

export default CtaBanner;
