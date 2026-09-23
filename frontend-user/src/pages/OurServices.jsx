// src/pages/OurServices.jsx — ruta /servicios. Pendiente de rediseño.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import SectionPlaceholder from '../components/SectionPlaceholder';

const OurServices = () => {
  usePageMeta(
    'El proceso',
    'Del vivero a tu taza: cultivo, cosecha selectiva, beneficio húmedo, secado al sol, tueste artesanal y venta directa. Toda la cadena en manos de la familia.'
  );
  return <SectionPlaceholder title="El proceso" hooks="useStoreConfig (services)" />;
};

export default OurServices;
