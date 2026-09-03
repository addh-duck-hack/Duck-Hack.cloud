// src/components/Customers.jsx — PROPUESTA B: "Cafeterías aliadas"
//
// Reusa la colección `testimonials` de StoreConfig como puntos de venta:
// name = cafetería, rubro = tipo · ciudad, description = qué sirven de Tacita,
// url = su sitio/redes, photoUrl = foto del lugar.
import React, { useMemo } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useStoreConfig, resolveStoreImageUrl } from '../hooks/useStoreConfig';
import { pickList } from '../utils/storeConfigLists';
import RichText from './RichText';
import './Customers.css';

const FALLBACK_CLIENTS = [
  {
    name: 'Café Corriente',
    rubro: 'Cafetería · Puebla',
    description: 'Sirve nuestro Blend Casa en barra y vende bolsa de 250 g para llevar.',
    url: '',
  },
  {
    name: 'La Borra Lenta',
    rubro: 'Cafetería de especialidad · CDMX, Roma',
    description: 'Rota nuestros microlotes en su carta de filtrados de temporada.',
    url: '',
  },
  {
    name: 'Cerro Verde',
    rubro: 'Tostador y tienda · Xalapa',
    description: 'Nos compra café verde en pergamino para sus propios perfiles de tueste.',
    url: '',
  },
  {
    name: 'Almáciga',
    rubro: 'Café y pan · Querétaro',
    description: 'Usa el Honey Garnica para su espresso de fin de semana.',
    url: '',
  },
  {
    name: 'Manantial',
    rubro: 'Cafetería · Monterrey',
    description: 'Ofrece nuestra suscripción a sus clientes frecuentes.',
    url: '',
  },
];

const Customers = () => {
  usePageMeta(
    'Cafeterías aliadas',
    'Dónde tomar Café Tacita: cafeterías, tostadores y tiendas en México que sirven y venden nuestro café.'
  );

  const { config } = useStoreConfig();
  const clients = useMemo(() => pickList(config?.testimonials, FALLBACK_CLIENTS), [config]);

  return (
    <section className="clients-view">
      <span className="eyebrow">Dónde nos sirven</span>
      <h1 className="section-title">Cafeterías aliadas</h1>
      <p className="section-sub">
        Lugares que ya sirven o venden Café Tacita. Si tienes una cafetería y quieres sumarte, escríbenos.
      </p>

      <div className="client-grid">
        {clients.map((c) => {
          const shot = resolveStoreImageUrl(c.photoUrl);
          const Wrapper = c.url ? 'a' : 'div';
          const wrapperProps = c.url ? { href: c.url, target: '_blank', rel: 'noopener noreferrer' } : {};
          return (
            <Wrapper className="client-card" key={c.name} {...wrapperProps}>
              {shot && (
                <div className="client-thumb">
                  <img src={shot} alt={c.name} />
                </div>
              )}
              <div className="client-body">
                <span className="rubro">{c.rubro}</span>
                <h3 className="name">{c.name}</h3>
                <RichText className="client-description" html={c.description} />
                {c.url && (
                  <span className="client-cta">
                    Visitar <i className="fas fa-arrow-right" aria-hidden="true" />
                  </span>
                )}
              </div>
            </Wrapper>
          );
        })}
      </div>
    </section>
  );
};

export default Customers;
