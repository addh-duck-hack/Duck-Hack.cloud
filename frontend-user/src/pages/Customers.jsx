// src/pages/Customers.jsx — ruta /clientes. Pendiente de rediseño.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import SectionPlaceholder from '../components/SectionPlaceholder';

const Customers = () => {
  usePageMeta(
    'Cafeterías aliadas',
    'Dónde tomar Café Tacita: cafeterías, tostadores y tiendas en México que sirven y venden nuestro café.'
  );
  return <SectionPlaceholder title="Cafeterías aliadas" hooks="useStoreConfig (testimonials)" />;
};

export default Customers;
