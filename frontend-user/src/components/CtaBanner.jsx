// src/components/CtaBanner.jsx
//
// Llamado a la acción común a todas las páginas, justo antes del footer
// (montado en AppShell): frase con la segunda parte en cursiva y acento,
// subtítulo con el nombre de la tienda (StoreConfig) y dos botones (tienda y
// contacto). El resto del texto es fijo.
import React from 'react';
import { Link } from 'react-router-dom';
import { useStoreConfig } from '../hooks/useStoreConfig';
import './CtaBanner.css';

const TAGLINE = 'el sabor de un café de altura';

const CtaBanner = () => {
  const { config } = useStoreConfig();
  const storeName = (config?.storeName || '').trim();

  return (
    <section className="cta-banner" aria-labelledby="cta-banner-title">
      <h2 id="cta-banner-title" className="cta-banner-title">
        La vida sin café <em>sería un error</em>
      </h2>
      <p className="cta-banner-lead">{storeName ? `${storeName}, ${TAGLINE}` : TAGLINE}</p>
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
};

export default CtaBanner;
