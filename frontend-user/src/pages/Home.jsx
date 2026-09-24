// src/pages/Home.jsx — ruta /. En rediseño: hero, métricas, origen y productos
// listos, resto de secciones pendientes.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import Hero from '../components/Hero';
import MetricsTimeline from '../components/MetricsTimeline';
import OriginSection from '../components/OriginSection';
import FeaturedProducts from '../components/FeaturedProducts';
import SectionPlaceholder from '../components/SectionPlaceholder';

const Home = () => {
  usePageMeta();
  return (
    <>
      <Hero />
      <MetricsTimeline />
      <OriginSection />
      <FeaturedProducts />
      <SectionPlaceholder title="Inicio" hooks="useStoreConfig, useRandomProducts" />
    </>
  );
};

export default Home;
