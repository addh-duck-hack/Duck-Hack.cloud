// src/pages/AboutUs.jsx — ruta /nosotros. En rediseño: bloque de historia
// listo, resto de secciones pendientes.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import AboutIntro from '../components/AboutIntro';

const AboutUs = () => {
  usePageMeta(
    'Nosotros',
    'Familia cafetera de Xicotepec, Puebla, dedicada al café desde 1973: cultivo, selección, proceso y tueste artesanal para clientes en Puebla, Veracruz, Hidalgo y Tlaxcala.'
  );
  return <AboutIntro />;
};

export default AboutUs;
