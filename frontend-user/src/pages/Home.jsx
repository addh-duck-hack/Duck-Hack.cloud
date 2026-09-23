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
      {/* TEMPORAL: 10000px de alto para probar el scroll de la barra superior. Quitar al diseñar la siguiente sección. */}
      <div style={{ height: 10000 }}>
        <SectionPlaceholder title="Inicio" hooks="useStoreConfig, useRandomProducts" />
      </div>
    </>
  );
};

export default Home;
