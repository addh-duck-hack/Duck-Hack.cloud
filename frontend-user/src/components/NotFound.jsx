import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import './NotFound.css';

// 404 del sitio: cualquier ruta que no exista. Va dentro de AppShell (con menú
// y footer). nginx sirve index.html para toda ruta (BrowserRouter), así que el
// servidor responde 200: por eso se marca `noindex` mientras esta página está
// montada, para que los buscadores no indexen URLs inexistentes.
const NotFound = () => {
  usePageMeta('Página no encontrada', 'La página que buscas no existe o se movió.');
  const location = useLocation();

  useEffect(() => {
    // index.html ya trae <meta name="robots" content="index, follow">: se
    // cambia mientras dure el 404 y se restaura al salir.
    let tag = document.querySelector('meta[name="robots"]');
    const created = !tag;
    if (created) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'robots');
      document.head.appendChild(tag);
    }
    const previous = tag.getAttribute('content');
    tag.setAttribute('content', 'noindex, follow');
    return () => {
      if (created) tag.remove();
      else tag.setAttribute('content', previous);
    };
  }, []);

  return (
    <section className="not-found">
      <span className="eyebrow">/404</span>
      <div className="not-found-code" aria-hidden="true">404</div>
      <h1 className="section-title">Página no encontrada</h1>
      <p className="not-found-path">
        <span className="not-found-prompt">$</span> cd {location.pathname}
        <br />
        <span className="not-found-error">bash: cd: {location.pathname}: No existe el archivo o el directorio</span>
      </p>
      <p className="section-sub">
        La dirección que buscas no existe o se movió. Revisa que esté bien escrita o elige a dónde quieres ir.
      </p>
      <div className="not-found-actions">
        <Link to="/" className="btn btn-solid">
          Ir al inicio
        </Link>
        <Link to="/servicios" className="btn">
          Ver servicios
        </Link>
        <Link to="/contacto" className="btn">
          Contacto
        </Link>
      </div>
    </section>
  );
};

export default NotFound;
