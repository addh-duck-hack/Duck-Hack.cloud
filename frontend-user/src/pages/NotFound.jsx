// src/pages/NotFound.jsx — cualquier ruta que no exista (<Route path="*">
// dentro de AppShell, con barra, CTA y footer). Mismo lenguaje que la canasta
// vacía (ícono en acento suave, título en dos tiempos, botones píldora) y
// cierra con sugerencias del catálogo para no dejar al visitante sin salida.
//
// nginx sirve index.html para toda ruta (BrowserRouter), así que el servidor
// responde 200: mientras esta página está montada el meta robots pasa a
// `noindex` para que los buscadores no indexen URLs inexistentes.
import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import CartSuggestions from '../components/CartSuggestions';
import './NotFound.css';

const NotFound = () => {
  usePageMeta('Página no encontrada', 'La página que buscas no existe o se movió.');
  const { pathname } = useLocation();

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
    <div className="not-found">
      <section className="not-found-hero" aria-labelledby="not-found-title">
        <div className="not-found-mug" aria-hidden="true">
          <i className="fas fa-mug-hot" />
          <span className="not-found-code">404</span>
        </div>

        <h1 id="not-found-title" className="not-found-title">
          Esta taza está
          <em>vacía</em>
        </h1>

        <p className="not-found-text">
          La página que buscas no existe o se movió. Mientras tanto, te servimos algo mejor: nuestros cafés de altura,
          tostados bajo pedido.
        </p>
        <p className="not-found-path">
          <i className="fas fa-link" aria-hidden="true" /> {pathname}
        </p>

        <div className="not-found-actions">
          <Link to="/tienda" className="not-found-btn not-found-btn--solid">
            Ir a la tienda
          </Link>
          <Link to="/" className="not-found-btn">
            Volver al inicio
          </Link>
        </div>
        <p className="not-found-help">
          ¿Llegaste aquí desde un enlace nuestro? <Link to="/contacto">Avísanos</Link> y lo arreglamos.
        </p>
      </section>

      <CartSuggestions title="Te puede gustar" className="not-found-suggestions" />
    </div>
  );
};

export default NotFound;
