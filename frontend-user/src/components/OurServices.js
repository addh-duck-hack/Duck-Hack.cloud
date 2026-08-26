// src/components/OurServices.js
import React, { useState } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import './OurServices.css';

const services = [
  {
    icon: 'fas fa-paint-brush',
    route: '/servicios/diseno-web',
    title: 'Diseño web',
    description:
      'Diseños personalizados y funcionales que representan la esencia de tu marca. Cuidamos cada detalle de la interfaz —tipografía, colores y experiencia de usuario— para que tu sitio se vea profesional en cualquier dispositivo.',
  },
  {
    icon: 'fas fa-laptop-code',
    route: '/servicios/desarrollo-web',
    title: 'Desarrollo web',
    description:
      'Soluciones web escalables y eficientes que impulsan tu negocio en línea. Construimos desde landing pages hasta plataformas a medida, con código limpio pensado para crecer junto con tu operación.',
  },
  {
    icon: 'fas fa-mobile-alt',
    route: '/servicios/apps-nativas',
    title: 'Aplicaciones nativas',
    description:
      'Experiencias móviles fluidas para iOS y Android, adaptadas a tus necesidades específicas. Te acompañamos desde el primer diseño hasta la publicación en las tiendas de aplicaciones.',
  },
  {
    icon: 'fas fa-server',
    route: '/servicios/hosting',
    title: 'Hosting',
    description:
      'Seguro, confiable y flexible. Ponemos tu negocio en línea sin complicaciones, con planes que se ajustan a tu crecimiento, soporte técnico en español y una disponibilidad garantizada del 99.9%.',
  },
  {
    icon: 'fas fa-palette',
    route: '/servicios/imagen-corporativa',
    title: 'Imagen corporativa',
    description:
      'Identidad visual que cautiva y comunica la esencia de tu marca. Diseñamos logotipos, paletas de color y manuales de marca coherentes para que tu negocio se reconozca en cualquier canal.',
  },
  {
    icon: 'fas fa-code',
    route: '/servicios/cloud',
    title: 'Servicios en la nube',
    description:
      'Diseño, almacenamiento y mantenimiento de servicios en la nube. Migramos, configuramos y damos seguimiento a tu infraestructura para que tu operación esté siempre disponible y protegida.',
  },
];

const OurServices = () => {
  usePageMeta(
    'Servicios de Diseño, Desarrollo y Hosting',
    'Diseño web, desarrollo web, apps nativas, imagen corporativa, hosting y servicios en la nube. Seis servicios, un mismo equipo.'
  );

  // En pantallas táctiles no hay :hover, así que un tap alterna la clase "flipped".
  // En desktop el hover ya voltea la tarjeta por CSS; el estado es una capa extra encima.
  const [flipped, setFlipped] = useState(() => new Set());

  const toggleFlip = (title) => {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  return (
    <section className="services-view">
      <span className="eyebrow">/servicios</span>
      <h1 className="section-title">Todo lo que necesita tu negocio en línea</h1>
      <p className="section-sub">
        Seis frentes, un mismo equipo: de la primera idea al mantenimiento continuo.
      </p>

      <div className="svc-grid">
        {services.map((service) => (
          <div
            className={`svc-card ${flipped.has(service.title) ? 'flipped' : ''}`}
            key={service.title}
            role="button"
            tabIndex={0}
            aria-pressed={flipped.has(service.title)}
            aria-label={`${service.title}: ${service.description}`}
            onClick={() => toggleFlip(service.title)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleFlip(service.title);
              }
            }}
          >
            <div className="svc-card-inner">
              <div className="svc-card-front">
                <div className="svc-icon">
                  <i className={service.icon}></i>
                </div>
                <div className="route">{service.route}</div>
              </div>
              <div className="svc-card-back">
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default OurServices;
