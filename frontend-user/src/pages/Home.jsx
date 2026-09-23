// src/pages/Home.jsx — ruta /. Pendiente de rediseño.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import SectionPlaceholder from '../components/SectionPlaceholder';

const Home = () => {
  usePageMeta();
  return <SectionPlaceholder title="Inicio" hooks="useStoreConfig, useRandomProducts" />;
};

export default Home;
