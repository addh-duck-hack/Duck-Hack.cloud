// src/components/Inicio.jsx — PROPUESTA B "De Sutu Cha'Nu"
//
// Inicio editorial: hero + manifiesto + proceso (del grano a la taza) + números
// de origen + teaser de presentaciones + cafeterías aliadas + CTA a la tienda.
// Cada bloque se alimenta de una colección de StoreConfig; el manifiesto es
// copy fijo de marca (no hay campo para él, igual que Misión/Visión).
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useStoreConfig, resolveStoreImageUrl } from '../hooks/useStoreConfig';
import { pickList } from '../utils/storeConfigLists';
import { formatMxn } from '../hooks/useCart';
import RichText from './RichText';
import { BrandSeal } from './BrandMarks';
import './Inicio.css';

const SLIDES = [
  {
    title: 'Café de altura, sembrado por manos totonacas.',
    description: 'Cinco generaciones en Xicotepec de Juárez, Puebla. De la planta a tu taza, sin intermediarios.',
  },
  {
    title: "de Sutu Cha'Nu — la tierra que nos da de comer.",
    description: 'En tutunakú nombra al suelo que nos sostiene. Es de donde venimos y a quién le debemos cada taza.',
  },
  {
    title: 'Tostado el día que te lo enviamos.',
    description: 'Perfilamos cada cosecha en el tostador de tambor de la familia y molemos a tu método antes de empacar.',
  },
];

// Copy fijo de marca — se muestra tal cual, no viene de StoreConfig.
const MANIFESTO = [
  'Sembramos <em class="script">café</em> donde nuestros abuelos sembraron café.',
  'Cortamos a mano, solo la cereza madura.',
  'Tostamos por lote y molemos por pedido.',
  'Lo demás es <em class="script">paciencia</em>.',
];

const STEPS = [
  { cmd: 'Sembramos', note: 'Vivero propio con Typica y Bourbon bajo sombra de chalahuite.' },
  { cmd: 'Cosechamos a mano', note: 'Corte selectivo: solo la cereza madura, en varios pases.' },
  { cmd: 'Beneficio húmedo', note: 'Despulpado el mismo día, fermentado y lavado con agua de manantial.' },
  { cmd: 'Secado al sol', note: 'En patio y camas africanas, volteado a mano 12 a 18 días.' },
  { cmd: 'Tueste artesanal', note: 'En tostador de tambor, perfilado para cada cosecha.' },
  { cmd: 'Molido y empacado', note: 'Bajo pedido, en bolsa con válvula desgasificadora.' },
];

const METRICS = [
  { value: '1,300', label: 'msnm de altura' },
  { value: '5', label: 'generaciones cafetaleras' },
  { value: '100%', label: 'arábica de sombra' },
  { value: '48 h', label: 'del tueste a tu envío' },
];

const PLANS = [
  { name: 'Tacita 250 g', price: '180', featured: false, extraFeatures: ['Molienda a tu método', 'Notas a panela y cacao'] },
  { name: 'Tacita 500 g', price: '320', originalPrice: '340', featured: true, extraFeatures: ['Rinde ~35 tazas', 'Empaque con válvula'] },
  { name: 'Tacita 1 kg', price: '580', featured: false, extraFeatures: ['Grano entero', 'Mejor precio por gramo'] },
  { name: 'Suscripción', price: '300', featured: false, extraFeatures: ['500 g al mes', 'Rotación de lotes'] },
];

const ALLIES = [
  { name: 'Café Corriente', rubro: 'Cafetería · Puebla' },
  { name: 'La Borra Lenta', rubro: 'Cafetería · CDMX, Roma' },
  { name: 'Cerro Verde', rubro: 'Tostador · Xalapa' },
  { name: 'Almáciga', rubro: 'Café y pan · Querétaro' },
  { name: 'Manantial', rubro: 'Cafetería · Monterrey' },
];

const READ_MS_PER_WORD = 260;
const MIN_SLIDE_MS = 4800;
const MAX_SLIDE_MS = 12000;

const getSlideDuration = (slide) => {
  const words = `${slide?.title || ''} ${slide?.description || ''}`.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(MAX_SLIDE_MS, Math.max(MIN_SLIDE_MS, words * READ_MS_PER_WORD));
};

const Inicio = () => {
  usePageMeta();
  const { config } = useStoreConfig();

  const slides = useMemo(
    () => pickList(config?.heroSlides, SLIDES).map((s, i) => ({ id: s.id ?? i, title: s.title, description: s.description })),
    [config]
  );
  const steps = useMemo(() => pickList(config?.commands, STEPS), [config]);
  const metrics = useMemo(() => pickList(config?.metrics, METRICS), [config]);
  const plans = useMemo(() => pickList(config?.pricingPlans, PLANS).slice(0, 4), [config]);
  const allies = useMemo(() => pickList(config?.testimonials, ALLIES).slice(0, 6), [config]);

  // Logo del admin (StoreConfig.logoUrl) dentro del disco del hero; si no hay
  // logo configurado o la imagen no resuelve, se cae al sello de marca.
  const brandName = config?.storeName || 'Café Tacita';
  const heroLogo = resolveStoreImageUrl(config?.logoUrl);
  const [logoBroke, setLogoBroke] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex >= slides.length) setCurrentIndex(0);
  }, [slides, currentIndex]);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || slides.length <= 1) return undefined;
    const duration = getSlideDuration(slides[currentIndex] || slides[0]);
    const timeoutId = setTimeout(() => setCurrentIndex((i) => (i + 1) % slides.length), duration);
    return () => clearTimeout(timeoutId);
  }, [slides, currentIndex]);

  const slide = slides[currentIndex] || slides[0];

  return (
    <div className="home-view">
      {/* ---- Hero ---- */}
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">de Sutu Cha'Nu</span>
          <div className="hero-rotate" key={slide?.id}>
            <h1 className="hero-title">{slide?.title}</h1>
            <RichText className="hero-lead" html={slide?.description} />
          </div>
          <div className="hero-cta">
            <Link className="btn btn-solid" to="/tienda">Ir a la tienda</Link>
            <Link className="btn" to="/nosotros">Leer nuestra raíz</Link>
          </div>
          {slides.length > 1 && (
            <div className="hero-dots">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  aria-current={i === currentIndex}
                  aria-label={`Ver mensaje ${i + 1}`}
                  onClick={() => setCurrentIndex(i)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="hero-figure">
          <div className="hero-disc">
            {heroLogo && !logoBroke ? (
              <img
                className="hero-disc-logo"
                src={heroLogo}
                alt={brandName}
                onError={() => setLogoBroke(true)}
              />
            ) : (
              <BrandSeal className="seal-lg" />
            )}
          </div>
          <span className="hero-cap">Xicotepec · Sierra Norte de Puebla</span>
        </div>
      </section>

      <hr className="rule" />

      {/* ---- Manifiesto ---- */}
      <div className="manifesto">
        {MANIFESTO.map((line) => (
          <p className="mf-line" key={line} dangerouslySetInnerHTML={{ __html: line }} />
        ))}
      </div>

      <hr className="rule" />

      {/* ---- Proceso ---- */}
      <div className="section-head">
        <span className="kicker">El proceso</span>
        <h2>Del grano a tu taza</h2>
      </div>
      <div className="timeline">
        {steps.map((s, i) => (
          <div className="tl-step" key={s.cmd || i}>
            <span className="tl-n">{String(i + 1).padStart(2, '0')}</span>
            <h3>{s.cmd}</h3>
            <RichText html={s.note} />
          </div>
        ))}
      </div>

      <hr className="rule" />

      {/* ---- Números de origen ---- */}
      <div className="origin">
        {metrics.map((m) => (
          <div className="origin-cell" key={m.label}>
            <div className="origin-n">{m.value}</div>
            <div className="origin-l">{m.label}</div>
          </div>
        ))}
      </div>

      <hr className="rule" />

      {/* ---- Presentaciones teaser ---- */}
      <div className="section-head">
        <span className="kicker">Presentaciones</span>
        <h2>Elige tu Tacita</h2>
      </div>
      <div className="pres">
        {plans.map((p) => (
          <Link className={`pres-card ${p.featured ? 'feat' : ''}`} to="/precios" key={p.name}>
            {p.featured && <span className="pres-tag">La favorita</span>}
            <h3>{p.name}</h3>
            <div className="pres-price">
              {p.price ? formatMxn(p.price) : 'Cotiza'}
              {p.originalPrice && <span className="was">{formatMxn(p.originalPrice)}</span>}
            </div>
            {p.extraFeatures?.length > 0 && (
              <ul>
                {p.extraFeatures.slice(0, 3).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </Link>
        ))}
      </div>

      <hr className="rule" />

      {/* ---- Cafeterías aliadas ---- */}
      <div className="section-head">
        <span className="kicker">Dónde nos sirven</span>
        <h2>Cafeterías aliadas</h2>
      </div>
      <div className="allies-row">
        {allies.map((a) => (
          <div className="ally" key={a.name}>
            <b>{a.name}</b>
            <span>{a.rubro}</span>
          </div>
        ))}
      </div>

      <hr className="rule" />

      {/* ---- CTA ---- */}
      <div className="big-cta">
        <span className="script">recién tostado</span>
        <h2>Pídelo hoy, lo tostamos hoy</h2>
        <Link className="btn" to="/tienda">Ver el catálogo completo</Link>
      </div>
    </div>
  );
};

export default Inicio;
