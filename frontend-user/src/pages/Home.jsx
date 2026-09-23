// src/pages/Home.jsx — ruta /. Pendiente de rediseño.
//
// El hero es por ahora solo un recuadro placeholder a pantalla completa,
// registrado con useHeroRef para que la barra superior flote sobre él. Se
// sustituye al diseñar la sección del hero (StoreConfig.heroSlides).
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useHeroRef } from '../hooks/useHero';
import SectionPlaceholder from '../components/SectionPlaceholder';

const Home = () => {
  usePageMeta();
  const heroRef = useHeroRef();
  return (
    <>
      <section ref={heroRef} style={{ height: '100vh' }}>
        <div className="img-placeholder">Hero</div>
      </section>
      <SectionPlaceholder title="Inicio" hooks="useStoreConfig, useRandomProducts" />
    </>
  );
};

export default Home;
