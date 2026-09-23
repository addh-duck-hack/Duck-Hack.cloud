// src/pages/Services.jsx — ruta /precios. Pendiente de rediseño.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import SectionPlaceholder from '../components/SectionPlaceholder';

const Services = () => {
  usePageMeta(
    'Descubre',
    'Un vistazo aleatorio a la carta de Café Tacita — cambia cada vez que entras. Ve el catálogo completo en la tienda.'
  );
  return <SectionPlaceholder title="Descubre" hooks="useRandomProducts" />;
};

export default Services;
