// src/components/Inicio.js
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { pickList } from '../utils/storeConfigLists';
import './Inicio.css';

// Fallback local — se usa mientras carga el store-config, si el fetch falla,
// o si el admin todavía no cargó contenido para esta sección.
const SLIDES = [
  {
    id: 1,
    title: 'Soluciones a Medida de tu Negocio',
    description: 'Desde el Registro de tu Dominio Hasta el Éxito Online',
  },
  {
    id: 2,
    title: 'Hosting Rápido, Seguro y Confiable',
    description: 'Protección Total para tu Sitio, clientes y empleados',
  },
  {
    id: 3,
    title: 'Impulsa tu Presencia Digital',
    description: 'Un Servicio Personalizado para Cada Cliente',
  },
];

const METRICS = [
  { value: '8', label: 'Clientes activos' },
  { value: '99.9%', label: 'Disponibilidad' },
  { value: '30d', label: 'Garantía de devolución' },
  { value: '24', label: 'Endpoints funcionales' },
];


const COMMANDS = [
  { cmd: 'desplegar hosting', note: 'planes adecuados a todo tipo de clientes' },
  { cmd: 'construir sitio', note: 'diseño + desarrollo web a medida' },
  { cmd: 'publicar app', note: 'aplicaciones nativas (iOS y Android)' },
  { cmd: 'configurar marca', note: 'imagen corporativa e identidad visual' },
];

// Duración de cada slide proporcional a su cantidad de palabras — un timer
// fijo (como el anterior de 5200ms) corta o no alcanza a mostrar texto más
// largo del que el admin pueda cargar ahora desde /admin/store-config/home.
// A ritmo de lectura (~230 palabras/min) más margen, con piso y techo para
// que ni un slide muy corto pase demasiado rápido ni uno muy largo se quede
// pegado.
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

  const metrics = useMemo(() => pickList(config?.metrics, METRICS), [config]);
  const commands = useMemo(() => pickList(config?.commands, COMMANDS), [config]);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Si la lista de slides cambia (ej. terminó de cargar el store-config) y el
  // índice actual quedó fuera de rango, se vuelve a 0 en vez de romper.
  useEffect(() => {
    if (currentIndex >= slides.length) setCurrentIndex(0);
  }, [slides, currentIndex]);

  // Rotación automática de slides: se reprograma en cada cambio con la
  // duración calculada para el slide actual (en vez de un intervalo fijo),
  // así el texto siempre tiene tiempo de mostrarse completo y leerse.
  // Respeta prefers-reduced-motion y no corre si solo hay un slide.
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || slides.length <= 1) return undefined;
    const duration = getSlideDuration(slides[currentIndex] || slides[0]);
    const timeoutId = setTimeout(() => {
      setCurrentIndex((i) => (i + 1) % slides.length);
    }, duration);
    return () => clearTimeout(timeoutId);
  }, [slides, currentIndex]);

  const slide = slides[currentIndex] || slides[0];

  return (
    <div className="home-view">
      <div className="term">
        <div className="term-bar">
          <span className="chrome-dots">
            <span className="c1" />
          </span>
          <span className="chrome-dots">
            <span className="c2" />
          </span>
          <span className="chrome-dots">
            <span className="c3" />
          </span>
          <span>duck-hack — sesión activa</span>
        </div>
        <div className="term-body">
          <div className="prompt">$ duckhack status --client=tu-negocio</div>
          <div className="term-copy" key={slide.id}>
            <h1>{slide.title}</h1>
            <p className="lede">{slide.description}</p>
          </div>
          <div className="term-actions">
            <Link className="btn btn-solid" to="/precios">
              ./ver-planes
            </Link>
            <Link className="btn" to="/contacto">
              ./contactar
            </Link>
          </div>
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
        </div>
      </div>

      <div className="bento">
        {metrics.map((m) => (
          <div className="cell" key={m.label}>
            <div className="num">{m.value}</div>
            <div className="lbl">{m.label}</div>
            {m.label === 'Disponibilidad' && (
              <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
                <polyline
                  points="0,22 15,18 30,20 45,10 60,14 75,6 90,9 100,4"
                  fill="none"
                  stroke="var(--signal)"
                  strokeWidth="2"
                />
              </svg>
            )}
          </div>
        ))}
      </div>

      <div className="cmdlist">
        {commands.map((c) => (
          <div className="row" key={c.cmd}>
            <span className="p">$</span> {c.cmd} <span className="c">{`// ${c.note}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Inicio;
