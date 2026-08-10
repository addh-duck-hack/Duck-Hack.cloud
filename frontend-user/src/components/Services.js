// src/components/Services.js
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import './Services.css';

const COMMON_CHECKS = [
  'Soporte técnico y en español',
  'Disponibilidad del 99.9%',
  'Se puede escalar o disminuir el plan sin penalización',
  'Política de devolución de 30 días',
];

const PLANS = [
  {
    name: 'Basic',
    description: 'Excelente para un negocio pequeño, una página personal o un blog personal.',
    storage: '10 GB',
    emailAccounts: '15',
    bandwidth: '100 GB',
    ssl: 'Costo preferencial',
    price: '250.00',
    featured: false,
  },
  {
    name: 'Medium',
    description:
      'Quieres un poco más, aquí podrás alojar un sitio más especializado como un blog con múltiples colaboradores.',
    storage: '15 GB',
    emailAccounts: '30',
    bandwidth: '150 GB',
    ssl: 'Incluido',
    price: '500.00',
    featured: false,
  },
  {
    name: 'Advanced',
    description: 'Para usuarios avanzados que necesitan el máximo desempeño, velocidad y seguridad para sus proyectos.',
    storage: '30 GB',
    emailAccounts: '100',
    bandwidth: 'Ilimitado',
    ssl: 'Incluido',
    price: '750.00',
    featured: true,
  },
  {
    name: 'Pro',
    description: 'Aún necesitas más, podemos ajustarnos a la medida de tus necesidades, el límite es tu imaginación.',
    storage: '100 GB',
    emailAccounts: 'Ilimitadas',
    bandwidth: 'Ilimitado',
    ssl: 'Incluido',
    price: '1,150.00',
    featured: false,
  },
];

const FAQS = [
  {
    q: '¿Puedo cambiar de plan después?',
    a: 'Sí, todos los planes se pueden escalar o disminuir sin penalización, según lo que necesite tu proyecto en cada momento.',
  },
  {
    q: '¿Qué pasa si no me convence el servicio?',
    a: 'Aplicamos una política de devolución de 30 días en todos los planes de hosting.',
  },
  {
    q: '¿El soporte es en español?',
    a: 'Sí, todo nuestro soporte técnico se ofrece en español, directo con nuestro equipo.',
  },
  {
    q: '¿Qué disponibilidad garantizan?',
    a: '99.9% de disponibilidad en todos los planes, monitoreada de forma continua.',
  },
];

const Services = () => {
  usePageMeta(
    'Planes y Precios de Hosting',
    'Cuatro planes de hosting desde $250 MXN al mes: almacenamiento, correos, ancho de banda y SSL incluido. Soporte técnico en español.'
  );

  return (
    <section className="pricing-view">
      <span className="eyebrow">/precios</span>
      <h1 className="section-title">Planes de hosting</h1>
      <p className="section-sub">
        Cuatro niveles según el tamaño de tu proyecto — todos con soporte en español y sin
        permanencia forzosa.
      </p>

      <div className="price-grid">
        {PLANS.map((plan) => (
          <div className={`price-card ${plan.featured ? 'featured' : ''}`} key={plan.name}>
            {plan.featured && <span className="badge price-badge">recomendado</span>}
            <div className="price-head">
              <div className="route">/precios/{plan.name.toLowerCase()}</div>
              <h3>{plan.name}</h3>
              <p>{plan.description}</p>
              <div className="price-amount">
                ${plan.price}
                <span> MXN/mes</span>
              </div>
            </div>
            <div className="price-body">
              <ul>
                <li>
                  <i className="fas fa-hdd" /> Almacenamiento: {plan.storage}
                </li>
                <li>
                  <i className="fas fa-envelope" /> Cuentas de correo: {plan.emailAccounts}
                </li>
                <li>
                  <i className="fas fa-wifi" /> Ancho de banda: {plan.bandwidth}
                </li>
                <li>
                  <i className="fas fa-lock" /> Certificado SSL: {plan.ssl}
                </li>
                {COMMON_CHECKS.map((check) => (
                  <li key={check}>
                    <i className="fas fa-check" /> {check}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <h2 className="faq-title">Preguntas frecuentes</h2>
      <div className="faq">
        {FAQS.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
};

export default Services;
