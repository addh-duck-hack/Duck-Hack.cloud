// src/pages/Home.jsx — ruta /. En rediseño: hero listo, resto de secciones
// pendientes.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import Hero from '../components/Hero';
import SectionPlaceholder from '../components/SectionPlaceholder';

const Home = () => {
  usePageMeta();
  return (
    <>
      <Hero />
      <SectionPlaceholder title="Inicio" hooks="useStoreConfig, useRandomProducts" />
    </>
  );
};

export default Home;
