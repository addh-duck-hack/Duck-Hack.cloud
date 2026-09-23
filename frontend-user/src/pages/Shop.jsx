// src/pages/Shop.jsx — ruta /tienda. Pendiente de rediseño.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import SectionPlaceholder from '../components/SectionPlaceholder';

const Shop = () => {
  usePageMeta(
    'Tienda',
    'Café de especialidad de Café Tacita: lotes en grano y molido, ediciones especiales y accesorios. Tostado bajo pedido, envíos a todo México.'
  );
  return <SectionPlaceholder title="Tienda" hooks="useProducts, groupByCategory, htmlExcerpt" />;
};

export default Shop;
