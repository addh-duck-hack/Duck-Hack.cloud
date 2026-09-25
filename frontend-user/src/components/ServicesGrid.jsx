// src/components/ServicesGrid.jsx
//
// "Un café, diferentes necesidades" en /clientes: una columna por cada
// servicio activo de StoreConfig.services (ícono de Font Awesome, título y
// descripción con HTML básico vía RichText). Encabezado fijo. Sin servicios
// configurados la sección no se muestra.
import React from 'react';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { sortActive } from '../utils/storeConfigLists';
import { htmlToText } from '../utils/htmlExcerpt';
import { safeIconClass } from '../utils/icons';
import RichText from './RichText';
import './ServicesGrid.css';

const ServicesGrid = () => {
  const { config } = useStoreConfig();
  const services = sortActive(config?.services || []).filter((s) => s.title);

  if (services.length === 0) return null;

  return (
    <section className="services" aria-labelledby="services-title">
      <header className="services-header">
        <h2 id="services-title" className="services-title">
          Un café, <em>diferentes necesidades</em>
        </h2>
        <p className="services-lead">
          Encuentra la presentación y el servicio que mejor se adapta a tu negocio o a tu forma de disfrutar el café.
        </p>
      </header>

      <ul className="services-grid">
        {services.map((service, i) => {
          const icon = safeIconClass(service.icon);
          return (
            <li key={`${i}-${service.title}`} className="services-item">
              {icon ? <i className={`${icon} services-icon`} aria-hidden="true" /> : null}
              <h3 className="services-item-title">{service.title}</h3>
              {htmlToText(service.description) ? (
                <RichText html={service.description} className="services-item-desc" />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default ServicesGrid;
