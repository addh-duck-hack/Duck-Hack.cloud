// src/components/OurServices.js
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import './OurServices.css';

const services = [
  {
    icon: 'fas fa-paint-brush',
    route: '/servicios/diseno-web',
    title: 'Diseño web',
    description: 'Diseños personalizados y funcionales que representan la esencia de tu marca.',
  },
  {
    icon: 'fas fa-laptop-code',
    route: '/servicios/desarrollo-web',
    title: 'Desarrollo web',
    description: 'Soluciones web escalables y eficientes que impulsan tu negocio en línea.',
  },
  {
    icon: 'fas fa-mobile-alt',
    route: '/servicios/apps-nativas',
    title: 'Aplicaciones nativas',
    description: 'Experiencias móviles fluidas para iOS y Android, adaptadas a tus necesidades específicas.',
  },
  {
    icon: 'fas fa-server',
    route: '/servicios/hosting',
    title: 'Hosting',
    description: 'Seguro, confiable y flexible. Ponemos tu negocio en línea sin complicaciones.',
  },
  {
    icon: 'fas fa-palette',
    route: '/servicios/imagen-corporativa',
    title: 'Imagen corporativa',
    description: 'Identidad visual que cautiva y comunica la esencia de tu marca.',
  },
  {
    icon: 'fas fa-code',
    route: '/servicios/cloud',
    title: 'Servicios en la nube',
    description: 'Diseño, almacenamiento y mantenimiento de servicios en la nube.',
  },
];

const OurServices = () => {
  usePageMeta(
    'Servicios de Diseño, Desarrollo y Hosting',
    'Diseño web, desarrollo web, apps nativas, imagen corporativa, hosting y servicios en la nube. Seis servicios, un mismo equipo.'
  );

  return (
    <section className="services-view">
      <span className="eyebrow">/servicios</span>
      <h1 className="section-title">Todo lo que necesita tu negocio en línea</h1>
      <p className="section-sub">
        Seis frentes, un mismo equipo: de la primera idea al mantenimiento continuo.
      </p>

      <div className="svc-grid">
        {services.map((service) => (
          <div className="svc-card" key={service.title}>
            <div className="svc-icon">
              <i className={service.icon}></i>
            </div>
            <div className="route">{service.route}</div>
            <h3>{service.title}</h3>
            <p>{service.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default OurServices;
