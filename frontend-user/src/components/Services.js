// src/components/Services.js
import React from 'react';
import { Link } from 'react-router-dom';
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
    originalPrice: '312.50',
    price: '250.00',
    discountPercent: 20,
    featured: false,
    extraFeaturesTitle: 'Incluye también:',
    extraFeatures: [
      'Backups semanales automáticos',
      'Panel de control en español',
      'Migración de sitio incluida',
    ],
  },
  {
    name: 'Medium',
    description:
      'Quieres un poco más, aquí podrás alojar un sitio más especializado como un blog con múltiples colaboradores.',
    storage: '15 GB',
    emailAccounts: '30',
    bandwidth: '150 GB',
    ssl: 'Incluido',
    originalPrice: '666.67',
    price: '500.00',
    discountPercent: 25,
    featured: true,
    extraFeaturesTitle: 'Todo lo del plan Basic, y además:',
    extraFeatures: [
      'Dominio con precio preferente el primer año',
      'Backups diarios automáticos',
      'Múltiples cuentas de administrador en WordPress',
    ],
  },
  {
    name: 'Advanced',
    description: 'Para usuarios avanzados que necesitan el máximo desempeño, velocidad y seguridad para sus proyectos.',
    storage: '30 GB',
    emailAccounts: '100',
    bandwidth: 'Ilimitado',
    ssl: 'Incluido',
    originalPrice: '882.35',
    price: '750.00',
    discountPercent: 15,
    featured: false,
    extraFeaturesTitle: 'Todo lo del plan Medium, y además:',
    extraFeatures: [
      'Certificado SSL Wildcard para subdominios',
      'Restauración de backups en un clic',
      'Soporte prioritario (respuesta en menos de 2 horas)',
    ],
  },
  {
    name: 'Enterprise',
    description:
      'Para operaciones grandes con requerimientos particulares: infraestructura, integraciones y soporte diseñados a la medida de tu negocio.',
    storage: 'A la medida',
    emailAccounts: 'Ilimitadas',
    bandwidth: 'Ilimitado',
    ssl: 'Incluido',
    originalPrice: null,
    price: null,
    discountPercent: null,
    featured: false,
    extraFeaturesTitle: 'Todo lo del plan Advanced y mucho mas de lo que puedas imaginar:',
    extraFeatures: [
      'Infraestructura y recursos a la medida',
      'Integraciones personalizadas (APIs, CRM, ERP)',
      'Soporte técnico dedicado y en español',
    ],
  },
];

const FAQS = [
  {
    q: '¿Por qué necesito un plan de hosting?',
    a: 'El hosting es lo que hace que tu sitio esté disponible en internet: es el espacio donde vive tu página, tu tienda o tu sistema, y permite que cualquier persona lo abra desde su navegador en cualquier momento. Sin hosting, tu dominio no tiene dónde apuntar. Puedes ver las diferencias entre nuestros planes más arriba, en esta misma página.',
  },
  {
    q: 'Ya tengo un sitio web. ¿Puedo migrarlo a Duck-Hack?',
    a: 'Sí, la migración es gratuita. Si tu sitio está hecho en un CMS como WordPress, nuestro equipo se encarga de migrarlo por ti sin costo adicional y sin que pierdas contenido ni configuración.',
  },
  {
    q: '¿El dominio está incluido en el precio del hosting?',
    a: 'No, el costo del dominio no está incluido en el hosting: varía según la extensión (.com, .mx, .cloud, etc.) y su disponibilidad, así que se cotiza aparte con nuestro equipo de desarrollo. Contáctanos y te ayudamos a elegir y cotizar el dominio que necesitas.',
  },
  {
    q: '¿Puedo cambiar de plan después?',
    a: 'Sí, es fácil, rápido y automático. Escalar o disminuir tu plan no genera tiempo de inactividad, así que tu sitio sigue funcionando durante todo el proceso, sin afectar la experiencia de tus visitantes ni tus ventas.',
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
    'Cuatro planes de hosting desde $250 MXN al mes con descuento permanente: almacenamiento, correos, ancho de banda y SSL incluido. Soporte técnico en español.'
  );

  return (
    <section className="pricing-view">
      <span className="eyebrow">/precios</span>
      <h1 className="section-title">Planes de hosting</h1>
      <p className="section-sub">
        Cuatro niveles según el tamaño de tu proyecto — todos con soporte en español y sin
        permanencia forzosa.
      </p>
      <p className="pricing-discount-note">
        <i className="fas fa-tag" aria-hidden="true" /> Descuento permanente en Basic, Medium y
        Advanced — el precio que ves ya lo incluye.
      </p>

      <div className="price-grid">
        {PLANS.map((plan) => (
          <div className={`price-card ${plan.featured ? 'featured' : ''}`} key={plan.name}>
            <div className="price-badges">
              <span>{plan.discountPercent && <span className="badge discount-badge">-{plan.discountPercent}%</span>}</span>
              <span>{plan.featured && <span className="badge price-badge">recomendado</span>}</span>
            </div>
            <div className="price-head">
              <div className="route">/precios/{plan.name.toLowerCase()}</div>
              <h3>{plan.name}</h3>
              <p>{plan.description}</p>
              {plan.price ? (
                <>
                  {plan.originalPrice && (
                    <div className="price-original">
                      ${plan.originalPrice} <span>MXN/mes</span>
                    </div>
                  )}
                  <div className="price-amount">
                    ${plan.price}
                    <span> MXN/mes</span>
                  </div>
                </>
              ) : (
                <div className="price-amount price-amount-quote">
                  Bajo cotización
                  <span>
                    <Link to="/contacto">Solicitar cotización →</Link>
                  </span>
                </div>
              )}
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

              {plan.extraFeatures?.length > 0 && (
                <div className="extra-features">
                  <p className="extra-features-title">{plan.extraFeaturesTitle}</p>
                  <ul>
                    {plan.extraFeatures.map((feature) => (
                      <li key={feature}>
                        <i className="fas fa-check" /> {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
