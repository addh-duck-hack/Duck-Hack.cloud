// src/pages/Home.jsx — ruta /: hero, métricas, origen de Xicotepec,
// productos aleatorios y testimonios.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import Hero from '../components/Hero';
import MetricsTimeline from '../components/MetricsTimeline';
import OriginSection from '../components/OriginSection';
import FeaturedProducts from '../components/FeaturedProducts';
import Testimonials from '../components/Testimonials';

const Home = () => {
  usePageMeta();
  return (
    <>
      <Hero />
      <MetricsTimeline />
      <OriginSection />
      <FeaturedProducts />
      <Testimonials />
    </>
  );
};

export default Home;
