// src/components/LegalPage.jsx — marco común de las páginas legales (Aviso de
// privacidad, Aviso legal, Política de devoluciones). Si el admin capturó el
// texto en Configurar tienda → Identidad legal (StoreConfig.privacyNotice /
// legalNotice / returnsPolicy, HTML básico), se muestra ese; si no, el
// contenido por defecto que pasa la página como `children` (si no hay, nada).
import React from 'react';
import RichText from './RichText';
import './LegalPage.css';

const LegalPage = ({ title, html, children }) => (
  <article className="legal-page" aria-labelledby="legal-page-title">
    <h1 id="legal-page-title">{title}</h1>
    {html ? <RichText html={html} allowLinks className="legal-page-body" /> : <div className="legal-page-body">{children}</div>}
  </article>
);

export default LegalPage;
