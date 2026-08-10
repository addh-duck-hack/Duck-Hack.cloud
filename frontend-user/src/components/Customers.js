// src/components/Customers.js
import React from 'react';
import latitud from '../assets/latitud-logo.png';
import textuales from '../assets/textuales-logo.png';
import quintosol from '../assets/quintosol-logo.png';
import salaverry from '../assets/salaverry-logo.png';
import empenosrio from '../assets/empenosrio-logo.png';
import dereporteros from '../assets/dereporteros-logo.png';
import { usePageMeta } from '../hooks/usePageMeta';
import './Customers.css';

const CLIENTS = [
  { src: latitud, name: 'Latitud Megalópolis', rubro: 'Medio digital', url: 'https://latitudmegalopolis.com/' },
  { src: textuales, name: 'Textual-es', rubro: 'Contenido editorial', url: 'https://textual-es.com/' },
  { src: quintosol, name: 'El Quinto Sol', rubro: 'Marketing e innovación', url: 'https://elquintosolmarketing.com/' },
  { src: salaverry, name: 'Torre Médica Salaverry', rubro: 'Clínica de especialidades', url: 'https://medicasalaverry.com/' },
  { src: empenosrio, name: 'Empeños Río', rubro: 'Casa de empeño', url: 'https://empenosrio.com' },
  { src: dereporteros, name: 'De Reporteros', rubro: 'Medio digital', url: 'https://dereporteros.com' },
];

const Customers = () => {
  usePageMeta(
    'Clientes',
    'Negocios que ya confían su presencia en línea al hosting y desarrollo web de Duck-Hack.'
  );

  return (
    <section className="clients-view">
      <span className="eyebrow">/clientes</span>
      <h1 className="section-title">Negocios que ya operan con nosotros</h1>
      <p className="section-sub">Un vistazo a quienes ya confían su presencia en línea a nuestro hosting.</p>

      <div className="client-grid">
        {CLIENTS.map((c) => (
          <a className="client-card" href={c.url} target="_blank" rel="noopener noreferrer" key={c.name}>
            <img src={c.src} alt={c.name} />
            <div>
              <div className="name">{c.name}</div>
              <div className="rubro">{c.rubro}</div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

export default Customers;
