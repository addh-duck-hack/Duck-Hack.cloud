// src/components/Customers.js
import React, { useMemo } from 'react';
import quintosolShot from '../assets/client-shots/quintosol-shot.jpg';
import latitudShot from '../assets/client-shots/latitud-shot.jpg';
import textualesShot from '../assets/client-shots/textuales-shot.jpg';
import empenosrioShot from '../assets/client-shots/empenosrio-shot.jpg';
import dereporterosShot from '../assets/client-shots/dereporteros-shot.jpg';
import romagaShot from '../assets/client-shots/romaga-shot.jpg';
import peajesmxShot from '../assets/client-shots/peajesmx-shot.jpg';
import { usePageMeta } from '../hooks/usePageMeta';
import { useStoreConfig, resolveStoreImageUrl } from '../hooks/useStoreConfig';
import { pickList } from '../utils/storeConfigLists';
import RichText from './RichText';
import './Customers.css';

const FALLBACK_CLIENTS = [
  {
    shot: latitudShot,
    name: 'Latitud Megalópolis',
    rubro: 'Medio digital',
    description: 'Medio digital de noticias y opinión. Su sitio web y hosting están desarrollados y administrados por Duck-Hack.',
    url: 'https://latitudmegalopolis.com/',
  },
  {
    shot: textualesShot,
    name: 'Textual-es',
    rubro: 'Contenido editorial',
    description: 'Estudio de contenido editorial. Construimos y alojamos su sitio web.',
    url: 'https://textual-es.com/',
  },
  {
    shot: quintosolShot,
    name: 'El Quinto Sol',
    rubro: 'Marketing e innovación',
    description: 'Agencia de marketing e innovación. Desarrollamos su sitio web y administramos su hosting.',
    url: 'https://elquintosolmarketing.com/',
  },
  {
    shot: empenosrioShot,
    name: 'Empeños Río',
    rubro: 'Casa de empeño',
    description: 'Casa de empeño con presencia física y en línea. Su sitio web corre con hosting de Duck-Hack.',
    url: 'https://empenosrio.com',
  },
  {
    shot: dereporterosShot,
    name: 'De Reporteros',
    rubro: 'Medio digital',
    description: 'Medio digital de noticias. Sitio web y hosting desarrollados y administrados por Duck-Hack.',
    url: 'https://dereporteros.com',
  },
  {
    shot: romagaShot,
    name: 'Transportes Romaga',
    rubro: 'Transporte y logística industrial',
    description:
      'Transporte, maniobras y suministro de agua para operaciones industriales y del sector petrolero. Su sitio web y hosting los desarrollamos y administramos nosotros.',
    url: 'https://romaga.duck-hack.cloud/',
  },
  {
    shot: peajesmxShot,
    name: 'Peajes MX',
    rubro: 'Cálculo de rutas y costos',
    description: 'Servicio para el cálculo de costos y tiempos de viaje en carretera. Su sitio web y hosting están desarrollados y administrados por Duck-Hack.',
    url: 'https://www.peajesmx.com/',
  },
];

const Customers = () => {
  usePageMeta(
    'Clientes',
    'Negocios que ya confían su presencia en línea al hosting y desarrollo web de Duck-Hack.'
  );

  const { config } = useStoreConfig();
  const clients = useMemo(() => pickList(config?.testimonials, FALLBACK_CLIENTS), [config]);

  return (
    <section className="clients-view">
      <span className="eyebrow">/clientes</span>
      <h1 className="section-title">Negocios que ya operan con nosotros</h1>
      <p className="section-sub">Un vistazo a quienes ya confían su presencia en línea a nuestro hosting.</p>

      <div className="client-grid">
        {clients.map((c) => {
          const shotSrc = resolveStoreImageUrl(c.photoUrl) || c.shot;
          return (
            <a className="client-card" href={c.url} target="_blank" rel="noopener noreferrer" key={c.name}>
              <div className="client-thumb">
                {shotSrc ? (
                  <img src={shotSrc} alt={`Sitio web de ${c.name}`} />
                ) : (
                  <div className="client-thumb-fallback" />
                )}
                <div className="client-thumb-overlay">
                  <span className="client-thumb-icon">
                    <i className="fas fa-arrow-up-right-from-square" />
                  </span>
                </div>
              </div>
              <div className="client-body">
                <span className="rubro">{c.rubro}</span>
                <h3 className="name">{c.name}</h3>
                <RichText className="client-description" html={c.description} />
                <span className="client-cta">
                  Visitar sitio <i className="fas fa-arrow-right" />
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
};

export default Customers;
