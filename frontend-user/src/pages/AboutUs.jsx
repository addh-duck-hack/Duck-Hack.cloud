// src/pages/AboutUs.jsx — ruta /nosotros. Pendiente de rediseño.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import SectionPlaceholder from '../components/SectionPlaceholder';

const AboutUs = () => {
  usePageMeta(
    'Nuestra raíz',
    'La finca de la familia Xochit en Xicotepec de Juárez, Puebla. Cinco generaciones cafetaleras de herencia totonaca — de Sutu Cha\'Nu.'
  );
  return <SectionPlaceholder title="Nuestra raíz" hooks="useStoreConfig (teamMembers)" />;
};

export default AboutUs;
