// src/pages/Home.jsx — ruta /. En rediseño: hero, métricas y origen listos,
// resto de secciones pendientes.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import Hero from '../components/Hero';
import MetricsTimeline from '../components/MetricsTimeline';
import OriginSection from '../components/OriginSection';
import SectionPlaceholder from '../components/SectionPlaceholder';

const Home = () => {
  usePageMeta();
  return (
    <>
      <Hero />
      <MetricsTimeline />
      <OriginSection />
      <SectionPlaceholder title="Inicio" hooks="useStoreConfig, useRandomProducts" />
    </>
  );
};

export default Home;
