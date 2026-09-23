// src/components/SectionPlaceholder.jsx
//
// Contenido temporal de una ruta que todavía no se rediseña. Se reemplaza
// página por página conforme se construye cada sección.
import React from 'react';

const SectionPlaceholder = ({ title, hooks }) => (
  <section className="section-placeholder">
    <h1>{title}</h1>
    <p>Sección en construcción.</p>
    {hooks ? <small>Lógica disponible en: {hooks}</small> : null}
  </section>
);

export default SectionPlaceholder;
