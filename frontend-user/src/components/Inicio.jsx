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
import RichText from './RichText';
import { BrandSeal } from './BrandMarks';
import RandomProducts from './RandomProducts';
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

// Glosario genérico de cata (no son afirmaciones sobre el perfil de un lote
// puntual, solo vocabulario estándar para describir café).
const TASTING_TERMS = [
  'Dulzor', 'Cuerpo', 'Acidez', 'Aroma', 'Final limpio', 'Balance',
  'Notas florales', 'Notas achocolatadas', 'Notas cítricas', 'Notas a caramelo',
];

// Reformula, en formato de lista, lo que el sitio ya afirma en otras páginas
// (Shop.jsx / OurServices.jsx / el hero) — no se inventan certificaciones ni
// afirmaciones nuevas.
const WHY_DIRECT = [
  'Tueste bajo pedido, no de bodega.',
  'Molienda a tu método, el día que lo enviamos.',
  'De la planta a tu taza, sin intermediarios.',
  'Trato directo con la familia productora.',
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
          {metrics.length > 0 && (
            <div className="hero-stats">
              {metrics.slice(0, 3).map((m) => (
                <div className="hero-stat" key={m.label}>
                  <b>{m.value}</b>
                  <span>{m.label}</span>
                </div>
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

      {/* ---- Vocabulario de cata (glosario, no afirma el perfil de un lote
          específico) ---- */}
      <div className="notes-marquee" aria-hidden="true">
        <div className="notes-track">
          {[...TASTING_TERMS, ...TASTING_TERMS].map((term, i) => (
            <span key={`${term}-${i}`}>{term}</span>
          ))}
        </div>
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

      {/* ---- Por qué directo del productor ---- */}
      <div className="section-head">
        <span className="kicker">Por qué así</span>
        <h2>Directo del productor a tu taza</h2>
      </div>
      <ul className="compare-list">
        {WHY_DIRECT.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <hr className="rule" />

      {/* ---- Descubre: productos al azar ---- */}
      <div className="section-head">
        <span className="kicker">Descubre</span>
        <h2>Prueba algo distinto</h2>
      </div>
      <RandomProducts count={4} />
      <Link className="btn" to="/tienda" style={{ marginTop: '18px' }}>Ver toda la carta →</Link>

      <hr className="rule" />

      {/* ---- Cafeterías aliadas ---- */}
      <div className="section-head">
        <span className="kicker">Dónde nos sirven</span>
        <h2>Cafeterías aliadas</h2>
      </div>
      <div className="allies-marquee">
        <div className="allies-track">
          {[...allies, ...allies].map((a, i) => (
            <div className="ally" key={`${a.name}-${i}`}>
              <b>{a.name}</b>
              <span>{a.rubro}</span>
            </div>
          ))}
        </div>
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
