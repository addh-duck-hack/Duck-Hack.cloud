// src/components/Services.jsx — PROPUESTA B: "Presentaciones" + preguntas frecuentes
//
// Reusa la colección `pricingPlans` de StoreConfig con etiquetas de café:
//   storage      -> Peso
//   emailAccounts-> Molienda
//   bandwidth    -> Tueste
//   ssl          -> Origen / Lote
//   extraFeatures-> notas de cata
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { pickList } from '../utils/storeConfigLists';
import { formatMxn } from '../hooks/useCart';
import RichText from './RichText';
import './Services.css';

const PLAN_ROWS = [
  { key: 'storage', label: 'Peso', icon: 'fas fa-weight-hanging' },
  { key: 'emailAccounts', label: 'Molienda', icon: 'fas fa-mortar-pestle' },
  { key: 'bandwidth', label: 'Tueste', icon: 'fas fa-fire' },
  { key: 'ssl', label: 'Origen / Lote', icon: 'fas fa-map-marker-alt' },
];

const FALLBACK_COMMON_CHECKS = [
  'Tostado bajo pedido, nunca semanas antes',
  'Empaque con válvula desgasificadora',
  'Molienda a tu método sin costo',
  'Envíos a todo México en 2 a 4 días',
];

const FALLBACK_PLANS = [
  {
    name: 'Tacita 250 g',
    description: 'Para probar un lote sin comprometer la despensa.',
    storage: '250 g',
    emailAccounts: 'A tu método o en grano',
    bandwidth: 'Medio',
    ssl: 'Lote El Chalahuite',
    originalPrice: null,
    price: '180',
    discountPercent: null,
    featured: false,
    extraFeaturesTitle: 'En taza:',
    extraFeatures: ['Panela, cacao y naranja', 'Cuerpo redondo, acidez media'],
  },
  {
    name: 'Tacita 500 g',
    description: 'La bolsa de la casa. Rinde unas 35 tazas.',
    storage: '500 g',
    emailAccounts: 'A elegir al pedir',
    bandwidth: 'Medio a medio-alto',
    ssl: 'Blend de la casa',
    originalPrice: '340',
    price: '320',
    discountPercent: 6,
    featured: true,
    extraFeaturesTitle: 'En taza:',
    extraFeatures: ['Chocolate amargo y dátil', 'Dulzor largo, buen cuerpo'],
  },
  {
    name: 'Tacita 1 kg',
    description: 'Para quien ya sabe lo que quiere cada mañana.',
    storage: '1 kg',
    emailAccounts: 'En grano (recomendado)',
    bandwidth: 'Medio-alto',
    ssl: 'Blend de la casa',
    originalPrice: null,
    price: '580',
    discountPercent: null,
    featured: false,
    extraFeaturesTitle: 'En taza:',
    extraFeatures: ['Mejor precio por gramo', 'Chocolate y fruta seca'],
  },
  {
    name: 'Suscripción mensual',
    description: 'Recibe café recién tostado cada mes, sin pensarlo.',
    storage: '500 g al mes',
    emailAccounts: 'A elegir',
    bandwidth: 'Rotación de perfiles',
    ssl: 'Cambia de lote cada envío',
    originalPrice: null,
    price: '300',
    discountPercent: null,
    featured: false,
    extraFeaturesTitle: 'Incluye:',
    extraFeatures: ['Prioridad en microlotes', 'Cancela cuando quieras'],
  },
];

const FALLBACK_FAQS = [
  {
    q: '¿Hacen envíos?',
    a: 'Sí, a todo México por paquetería. Los pedidos antes de las 12:00 se tuestan y se envían el mismo día. El envío es gratis a partir de $600.',
  },
  {
    q: '¿Cómo conservo el café?',
    a: 'En su bolsa cerrada, lejos de la luz y el calor. No lo guardes en el refrigerador. Sabe mejor entre el día 4 y el día 30 después del tueste.',
  },
  {
    q: '¿Qué molienda elijo?',
    a: 'Dinos tu método —prensa francesa, V60, espresso, cafetera italiana o americana— y lo molemos a esa medida. Si no estás seguro, pídelo en grano.',
  },
  {
    q: '¿Venden a cafeterías o mayoreo?',
    a: 'Sí. Escríbenos para precios de mayoreo, muestras y perfiles de tueste a tu gusto.',
  },
  {
    q: '¿Qué significa "de Sutu Cha\'Nu"?',
    a: 'Es tutunakú (totonaco) y nombra a la tierra que nos da de comer. Es de dónde venimos y a quién le debemos el café.',
  },
];

const Services = () => {
  usePageMeta(
    'Presentaciones',
    'Café Tacita en 250 g, 500 g, 1 kg y suscripción mensual. Tostado bajo pedido, molienda a tu método y envíos a todo México.'
  );

  const { config } = useStoreConfig();
  const commonChecks = useMemo(
    () => (config?.commonPlanChecks?.length ? config.commonPlanChecks : FALLBACK_COMMON_CHECKS),
    [config]
  );
  const plans = useMemo(() => pickList(config?.pricingPlans, FALLBACK_PLANS), [config]);
  const faqs = useMemo(() => pickList(config?.faqs, FALLBACK_FAQS), [config]);

  return (
    <section className="pricing-view">
      <span className="eyebrow">Presentaciones</span>
      <h1 className="section-title">Elige tu Tacita</h1>
      <p className="section-sub">
        El mismo café, en el tamaño que te acomode. Todo se tuesta bajo pedido y se muele a tu método el día del
        envío.
      </p>

      <div className="pres-grid">
        {plans.map((plan) => (
          <article className={`pres-plan ${plan.featured ? 'feat' : ''}`} key={plan.name}>
            {plan.featured && <span className="badge">La favorita</span>}
            {plan.discountPercent ? <span className="badge disc">-{plan.discountPercent}%</span> : null}
            <h3>{plan.name}</h3>
            <RichText className="pres-desc" html={plan.description} />

            {plan.price ? (
              <div className="pres-amount">
                {plan.originalPrice && <span className="was">{formatMxn(plan.originalPrice)}</span>}
                <span className="now">{formatMxn(plan.price)}</span>
                <span className="unit"> MXN</span>
              </div>
            ) : (
              <div className="pres-amount">
                <Link to="/contacto">Escríbenos →</Link>
              </div>
            )}

            <ul className="pres-rows">
              {PLAN_ROWS.map((row) =>
                plan[row.key] ? (
                  <li key={row.key}>
                    <i className={row.icon} aria-hidden="true" /> {row.label}: {plan[row.key]}
                  </li>
                ) : null
              )}
              {commonChecks.map((check) => (
                <li key={check}>
                  <i className="fas fa-check" aria-hidden="true" /> {check}
                </li>
              ))}
            </ul>

            {plan.extraFeatures?.length > 0 && (
              <div className="pres-extra">
                <p className="pres-extra-title">{plan.extraFeaturesTitle}</p>
                <ul>
                  {plan.extraFeatures.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </div>
            )}

            <Link className="btn btn-solid pres-cta" to="/tienda">Ver en la tienda</Link>
          </article>
        ))}
      </div>

      <hr className="rule" />

      <h2 className="faq-title">Preguntas frecuentes</h2>
      <div className="faq">
        {faqs.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <RichText html={f.a} />
          </details>
        ))}
      </div>
    </section>
  );
};

export default Services;
