// src/components/OurServices.jsx — PROPUESTA B: "El proceso" / "Qué hacemos"
//
// La cadena completa que controla la familia, del vivero a la venta directa.
// Se alimenta de la colección `services` de StoreConfig (misma fuente que el
// dropdown de /contacto — por eso FALLBACK_SERVICES se sigue exportando).
import React, { useMemo } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { pickList } from '../utils/storeConfigLists';
import RichText from './RichText';
import './OurServices.css';

export const FALLBACK_SERVICES = [
  {
    icon: 'fas fa-seedling',
    title: 'Cultivo',
    description:
      'Vivero propio y cafetales de sombra a 1,300 msnm en Xicotepec. Variedades Typica, Bourbon y Garnica bajo árboles de chalahuite.',
  },
  {
    icon: 'fas fa-hand-holding-heart',
    title: 'Cosecha selectiva',
    description:
      'Corte a mano, grano por grano, en varios pases: solo entra la cereza en su punto exacto de madurez.',
  },
  {
    icon: 'fas fa-water',
    title: 'Beneficio húmedo',
    description:
      'Despulpado el mismo día, fermentación controlada y lavado con agua de manantial. De ahí sale el café pergamino.',
  },
  {
    icon: 'fas fa-sun',
    title: 'Secado al sol',
    description:
      'En patio de cemento y camas africanas, volteado a mano de 12 a 18 días hasta el punto justo de humedad.',
  },
  {
    icon: 'fas fa-fire',
    title: 'Tueste artesanal',
    description:
      'En tostador de tambor, perfilado lote por lote. Tostamos apenas antes de enviar, nunca semanas antes.',
  },
  {
    icon: 'fas fa-mug-hot',
    title: 'Venta directa y catación',
    description:
      'Del productor a tu taza, sin intermediarios. Recibimos visitas en la finca para catar la cosecha del año.',
  },
];

const OurServices = () => {
  usePageMeta(
    'El proceso',
    'Del vivero a tu taza: cultivo, cosecha selectiva, beneficio húmedo, secado al sol, tueste artesanal y venta directa. Toda la cadena en manos de la familia.'
  );

  const { config } = useStoreConfig();
  const services = useMemo(() => pickList(config?.services, FALLBACK_SERVICES), [config]);

  return (
    <section className="services-view">
      <span className="eyebrow">El proceso</span>
      <h1 className="section-title">Del grano a tu taza, todo lo hacemos nosotros</h1>
      <p className="section-sub">
        Controlamos cada paso de la cadena. Nada sale de nuestras manos hasta que va a las tuyas.
      </p>

      <div className="proc-grid">
        {services.map((service, i) => (
          <article className="proc-card" key={service.title}>
            <span className="proc-n">{String(i + 1).padStart(2, '0')}</span>
            <span className="proc-icon" aria-hidden="true">
              <i className={service.icon || 'fas fa-leaf'} />
            </span>
            <h3>{service.title}</h3>
            <RichText html={service.description} />
          </article>
        ))}
      </div>
    </section>
  );
};

export default OurServices;
