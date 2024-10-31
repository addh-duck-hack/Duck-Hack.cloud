// src/components/OurServices.js
import React from 'react';
import './OurServices.css';

const services = [
  {
    icon: 'fas fa-paint-brush',
    title: 'Diseño web',
    description: 'Diseños personalizados y funcionales que representan la esencia de tu marca.',
  },
  {
    icon: 'fas fa-laptop-code',
    title: 'Desarrollo web',
    description: 'Soluciones web escalables y eficientes que impulsan tu negocio en línea.',
  },
  {
    icon: 'fas fa-mobile-alt',
    title: 'Aplicaciones nativas',
    description: 'Experiencias móviles fluidas y adaptadas a tus necesidades específicas.',
  },
  {
    icon: 'fas fa-server',
    title: 'Hosting',
    description: 'Seguro, confiable y flexible. Ponemos tu negocio en línea sin complicaciones.',
  },
  {
    icon: 'fas fa-palette',
    title: 'Imagen corporativa',
    description: 'Identidad visual que cautiva y comunica la esencia de tu marca.',
  },
  {
    icon: 'fas fa-code',
    title: 'Servicios',
    description: 'Diseño, almacenamiento y mantenimiento de servicios en la nube.',
  }
];

const OurServices = () => {
  return (
    <section id="services" className="our-services">
      <h2 className="section-title">NUESTROS SERVICIOS</h2>
      <div className="service-items">
        {services.map((service, index) => (
          <div className="service-item" key={index}>
            <div className="service-icon">
              <i className={service.icon}></i>
            </div>
            <h3 className="service-title">{service.title}</h3>
            <p className="service-description">{service.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default OurServices;
