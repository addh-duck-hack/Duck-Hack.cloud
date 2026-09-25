// src/pages/Customers.jsx — ruta /clientes: cafeterías aliadas. En rediseño:
// bloque de apertura listo, resto de secciones pendientes.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import PageIntro from '../components/PageIntro';

const INTRO_PARAGRAPHS = [
  'Nuestro café llega a cafeterías que buscan ofrecer a sus clientes una experiencia auténtica, respaldada por un producto de origen, un proceso cuidado y una tradición familiar que comenzó en 1973. Trabajamos de cerca con cada establecimiento para conocer sus necesidades y ofrecer diferentes perfiles y presentaciones que puedan integrarse a su propuesta.',
  'Desde cafeterías independientes hasta establecimientos con una comunidad de clientes consolidada, buscamos construir relaciones basadas en la confianza, la calidad y la constancia. Nuestro compromiso es acompañar a cada cafetería para que pueda servir un café que conserve las características de su origen y que, al mismo tiempo, se adapte a la experiencia que quiere crear para sus clientes.',
  'Cada cafetería asociada representa una nueva oportunidad para compartir nuestra historia. Así, el café que nace en las tierras altas de Xicotepec, Puebla, continúa su recorrido hasta convertirse en una taza que reúne el trabajo del campo, la experiencia de varias generaciones y la pasión de quienes disfrutan preparar y servir un buen café.',
];

const Customers = () => {
  usePageMeta(
    'Cafeterías aliadas',
    'Cafeterías que sirven café de origen de Xicotepec, Puebla: perfiles y presentaciones para cada establecimiento, con una tradición familiar desde 1973.'
  );
  return (
    <PageIntro
      id="customers-intro"
      title="El café también se disfruta en buena compañía"
      highlight="Cafeterías que comparten nuestra pasión por el buen café"
      paragraphs={INTRO_PARAGRAPHS}
      cta={{ to: '/contacto', label: 'Quiero ser cafetería aliada' }}
    />
  );
};

export default Customers;
