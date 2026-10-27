// src/components/Services.js
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { pickList } from '../utils/storeConfigLists';
import RichText from './RichText';
import './Services.css';

const formatPrice = (value) => (value === null || value === undefined ? null : Number(value).toFixed(2));

// Características de un plan (StoreConfig.pricingPlans[].features, pares
// "Nombre: valor" que se editan en el admin). Los planes guardados antes de
// la migración (backend/scripts/migrate-pricing-plan-features.mongo.js) y los
// de muestra de abajo todavía traen los campos fijos de hosting: se leen como
// características con el mismo nombre que les da la migración.
const LEGACY_PLAN_FIELDS = [
  ['storage', 'Almacenamiento'],
  ['emailAccounts', 'Cuentas de correo'],
  ['bandwidth', 'Ancho de banda'],
  ['ssl', 'SSL'],
];

const planFeatures = (plan) =>
  plan.features?.length
    ? plan.features
    : LEGACY_PLAN_FIELDS.filter(([field]) => plan[field]).map(([field, name]) => ({ name, value: plan[field] }));

// Ícono por nombre de característica; cualquier otra lleva una palomita.
const FEATURE_ICONS = {
  almacenamiento: 'fas fa-hdd',
  'cuentas de correo': 'fas fa-envelope',
  'ancho de banda': 'fas fa-wifi',
  ssl: 'fas fa-lock',
  'certificado ssl': 'fas fa-lock',
};
const featureIcon = (name) => FEATURE_ICONS[String(name).trim().toLowerCase()] || 'fas fa-check';

const FALLBACK_COMMON_CHECKS = [
  'Soporte técnico y en español',
  'Disponibilidad del 99.9%',
  'Se puede escalar o disminuir el plan sin penalización',
  'Política de devolución de 30 días',
];

const FALLBACK_PLANS = [
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

const FALLBACK_FAQS = [
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

// Paquetes "sitio + hosting" (diseño con pago único + un plan de hosting
// mensual). No hay campo en StoreConfig para esto, así que viven aquí; el
// precio del hosting sí se toma del plan con ese nombre para que no se
// desfase si se edita en el admin.
const DESIGN_PACKAGES = [
  {
    slug: 'negocio',
    name: 'Sitio para tu negocio',
    description:
      'Sitio rápido y a la medida de tu marca, ideal para restaurantes, consultorios, despachos, talleres y comercios.',
    designFrom: 1500,
    hostingPlan: 'Basic',
    hostingFallbackPrice: 250,
    featured: false,
    features: [
      'Diseño a la medida de tu marca',
      'Se ve bien en celular, tablet y computadora',
      'Botón de WhatsApp y formulario de contacto',
      'Hosting Basic: 10 GB y 15 cuentas de correo',
    ],
  },
  {
    slug: 'noticias',
    name: 'Sitio de noticias',
    description:
      'Tema de WordPress diseñado para tu medio: tú publicas tus notas y WordPress se encarga de administrar el sitio.',
    designFrom: 3000,
    hostingPlan: 'Medium',
    hostingFallbackPrice: 500,
    featured: true,
    features: [
      'Tema de WordPress a la medida de tu medio',
      'Varias cuentas para tu equipo de redacción',
      'Backups diarios automáticos',
      'Hosting Medium: 15 GB, 30 cuentas de correo y SSL incluido',
    ],
  },
];

const DEFAULT_WHATSAPP_NUMBER = '5215661653418';

const formatMxn = (value) => Number(value).toLocaleString('es-MX');

// Link de WhatsApp con el mensaje del paquete; el número sale del link
// configurado en el admin si tiene la forma wa.me/<número>.
const packageWhatsappLink = (configuredLink, packageName) => {
  const number = configuredLink?.match(/wa\.me\/(\d+)/)?.[1] || DEFAULT_WHATSAPP_NUMBER;
  const text = `Hola, me interesa el paquete "${packageName} + hosting". ¿Me pueden dar una cotización?`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
};

const Services = () => {
  usePageMeta(
    'Precios de Sitios Web y Hosting',
    'Sitio para tu negocio desde $1,500 MXN, sitio de noticias en WordPress desde $3,000 MXN y hosting desde $250 MXN al mes. Soporte técnico en español.'
  );

  const { config } = useStoreConfig();
  const commonChecks = useMemo(
    () => (config?.commonPlanChecks?.length ? config.commonPlanChecks : FALLBACK_COMMON_CHECKS),
    [config]
  );
  const plans = useMemo(() => pickList(config?.pricingPlans, FALLBACK_PLANS), [config]);
  const faqs = useMemo(() => pickList(config?.faqs, FALLBACK_FAQS), [config]);
  const hostingPrice = (pkg) =>
    plans.find((plan) => plan.name === pkg.hostingPlan)?.price || pkg.hostingFallbackPrice;

  return (
    <section className="pricing-view">
      <span className="eyebrow">/precios</span>
      <h1 className="section-title">Tu sitio web + hosting</h1>
      <p className="section-sub">
        Diseñamos tu sitio y lo mantenemos en línea en nuestros servidores: un solo equipo, un solo
        lugar para pedir ayuda.
      </p>

      <div className="package-grid">
        {DESIGN_PACKAGES.map((pkg) => (
          <div className={`price-card ${pkg.featured ? 'featured' : ''}`} key={pkg.slug}>
            <div className="price-badges">
              <span />
              <span>{pkg.featured && <span className="badge price-badge">especialidad</span>}</span>
            </div>
            <div className="price-head">
              <div className="route">/paquetes/{pkg.slug}</div>
              <h3>{pkg.name}</h3>
              <p>{pkg.description}</p>
              <div className="package-prices">
                <div className="price-amount">
                  <span>Diseño desde </span>${formatMxn(pkg.designFrom)}
                  <span> MXN pago único</span>
                </div>
                <div className="package-hosting">
                  + Hosting {pkg.hostingPlan} ${formatMxn(hostingPrice(pkg))} MXN/mes
                </div>
              </div>
            </div>
            <div className="price-body">
              <ul>
                {pkg.features.map((feature) => (
                  <li key={feature}>
                    <i className="fas fa-check" /> {feature}
                  </li>
                ))}
              </ul>
              <a
                className="btn btn-solid package-cta"
                href={packageWhatsappLink(config?.socialLinks?.whatsapp, pkg.name)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-whatsapp" aria-hidden="true" /> Cotizar por WhatsApp
              </a>
            </div>
          </div>
        ))}
      </div>
      <p className="package-note">
        El precio final del diseño depende de la complejidad del sitio; te enviamos una cotización sin
        compromiso. Mira sitios que ya hicimos en <Link to="/clientes">nuestros clientes</Link>.
      </p>

      <h2 className="pricing-subtitle">Planes de hosting</h2>
      <p className="section-sub">
        Cuatro niveles según el tamaño de tu proyecto — todos con soporte en español y sin
        permanencia forzosa.
      </p>
      <p className="pricing-discount-note">
        <i className="fas fa-tag" aria-hidden="true" /> Descuento permanente en Basic, Medium y
        Advanced — el precio que ves ya lo incluye.
      </p>

      <div className="price-grid">
        {plans.map((plan) => (
          <div className={`price-card ${plan.featured ? 'featured' : ''}`} key={plan.name}>
            <div className="price-badges">
              <span>{plan.discountPercent && <span className="badge discount-badge">-{plan.discountPercent}%</span>}</span>
              <span>{plan.featured && <span className="badge price-badge">recomendado</span>}</span>
            </div>
            <div className="price-head">
              <div className="route">/precios/{plan.name.toLowerCase()}</div>
              <h3>{plan.name}</h3>
              <RichText html={plan.description} />
              {plan.price ? (
                <>
                  {plan.originalPrice && (
                    <div className="price-original">
                      ${formatPrice(plan.originalPrice)} <span>MXN/mes</span>
                    </div>
                  )}
                  <div className="price-amount">
                    ${formatPrice(plan.price)}
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
                {planFeatures(plan).map((feature) => (
                  <li key={feature.name}>
                    <i className={featureIcon(feature.name)} /> {feature.name}: {feature.value}
                  </li>
                ))}
                {commonChecks.map((check) => (
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
