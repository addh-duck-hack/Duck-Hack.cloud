// src/components/PageIntro.jsx
//
// Bloque de apertura de páginas de contenido (Nosotros, Clientes): a la
// izquierda el título en dos tiempos (`title` y, debajo, `highlight` en
// cursiva y color acento), fijo mientras se lee en escritorio; a la derecha
// los párrafos justificados y un botón opcional. Cierra con una línea
// divisoria. El texto lo pasa cada página.
import React from 'react';
import { Link } from 'react-router-dom';
import './PageIntro.css';

const PageIntro = ({ id, title, highlight, paragraphs = [], cta }) => {
  const titleId = `${id}-title`;
  return (
    <section className="page-intro" aria-labelledby={titleId}>
      <div className="page-intro-heading">
        <h1 id={titleId} className="page-intro-title">
          {title}
          {highlight ? <em>{highlight}</em> : null}
        </h1>
      </div>

      <div className="page-intro-body">
        {paragraphs.map((text, i) => (
          <p key={i} className="text-justify">
            {text}
          </p>
        ))}

        {cta ? (
          <Link to={cta.to} className="page-intro-cta">
            {cta.label}
          </Link>
        ) : null}
      </div>
    </section>
  );
};

export default PageIntro;
