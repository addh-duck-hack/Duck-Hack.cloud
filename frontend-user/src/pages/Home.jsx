// src/pages/Home.jsx — ruta /: hero, banners de promociones, métricas, origen de Xicotepec,
// productos aleatorios y testimonios.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import Hero from '../components/Hero';
import PromoBanners from '../components/PromoBanners';
import MetricsTimeline from '../components/MetricsTimeline';
import OriginSection from '../components/OriginSection';
import FeaturedProducts from '../components/FeaturedProducts';
import Testimonials from '../components/Testimonials';

const Home = () => {
  usePageMeta();
  return (
    <>
      <Hero />
      <PromoBanners placement="home" />
      <MetricsTimeline />
      <OriginSection />
      <FeaturedProducts />
      <Testimonials />
    </>
  );
};

export default Home;
