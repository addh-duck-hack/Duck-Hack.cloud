// src/pages/AboutUs.jsx — ruta /nosotros: historia de la familia y equipo.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import PageIntro from '../components/PageIntro';
import TeamSection from '../components/TeamSection';

const INTRO_PARAGRAPHS = [
  'Somos una familia cafetera con raíces en Xicotepec, Puebla, dedicada al café desde 1973. Durante varias generaciones hemos cultivado, seleccionado, procesado y comercializado café de manera artesanal, conservando los conocimientos y las prácticas que hemos aprendido de quienes nos precedieron.',
  'Nuestra historia comenzó en el campo, entre las montañas y cafetales de nuestra región, y con el paso de los años hemos llevado nuestro café más allá de su lugar de origen. Hoy trabajamos con minoristas, mayoristas, cafeterías y otros negocios que buscan un café de calidad, con identidad y un origen que pueda conocerse.',
  'A lo largo de este camino hemos mantenido una filosofía sencilla: respetar el café desde su origen hasta la taza. Cada etapa, desde el cultivo y la selección del grano hasta su procesamiento, tueste y entrega, forma parte de un proceso que combina la experiencia de varias generaciones con nuestra visión de seguir creciendo.',
  'Actualmente llevamos nuestro café a clientes en Puebla, Veracruz, Hidalgo y Tlaxcala, construyendo relaciones que van más allá de una venta. Porque para nosotros, cada cliente forma parte de una historia que comenzó hace más de cinco décadas y que seguimos escribiendo con el mismo respeto por la tierra, el café y nuestro trabajo.',
];

const AboutUs = () => {
  usePageMeta(
    'Nosotros',
    'Familia cafetera de Xicotepec, Puebla, dedicada al café desde 1973: cultivo, selección, proceso y tueste artesanal para clientes en Puebla, Veracruz, Hidalgo y Tlaxcala.'
  );
  return (
    <>
      <PageIntro
        id="about-intro"
        title="Una historia que comienza en 1973"
        highlight="Más de 50 años cultivando una tradición"
        paragraphs={INTRO_PARAGRAPHS}
        cta={{ to: '/tienda', label: 'Visita nuestra tienda' }}
      />
      <TeamSection />
    </>
  );
};

export default AboutUs;
