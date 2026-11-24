// src/components/Customers.js
import React, { useMemo } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useStoreConfig, resolveStoreImageUrl } from '../hooks/useStoreConfig';
import { sortActive } from '../utils/storeConfigLists';
import NotFound from './NotFound';
import RichText from './RichText';
import './Customers.css';

const Customers = () => {
  usePageMeta(
    'Clientes',
    'Negocios que ya confían su presencia en línea al hosting y desarrollo web de Duck-Hack.'
  );

  // Sin datos estáticos de respaldo: los clientes salen solo de StoreConfig
  // (admin → Configurar tienda → Testimonios). Mientras carga no se pinta nada
  // (evita un 404 momentáneo); si la API falla o no hay testimonios activos,
  // la página es un 404.
  const { config, isLoading } = useStoreConfig();
  const clients = useMemo(() => sortActive(config?.testimonials || []), [config]);

  if (isLoading) return null;
  if (!clients.length) return <NotFound />;

  return (
    <section className="clients-view">
      <span className="eyebrow">/clientes</span>
      <h1 className="section-title">Negocios que ya operan con nosotros</h1>
      <p className="section-sub">Un vistazo a quienes ya confían su presencia en línea a nuestro hosting.</p>

      <div className="client-grid">
        {clients.map((c) => {
          const shotSrc = resolveStoreImageUrl(c.photoUrl);
          return (
            <a className="client-card" href={c.url} target="_blank" rel="noopener noreferrer" key={c._id || c.name}>
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
