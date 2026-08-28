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
  { p: '$', cmd: 'desplegar hosting', note: 'planes adecuados a todo tipo de clientes' },
  { p: '$', cmd: 'construir sitio', note: 'diseño + desarrollo web a medida' },
  { p: '$', cmd: 'publicar app', note: 'aplicaciones nativas (iOS y Android)' },
  { p: '$', cmd: 'configurar marca', note: 'imagen corporativa e identidad visual' },
];

const Inicio = () => {
  usePageMeta();
  const { config } = useStoreConfig();

  const slides = useMemo(
    () => pickList(config?.heroSlides, SLIDES).map((s, i) => ({ id: s.id ?? i, title: s.title, description: s.description })),
    [config]
  );

  const metrics = useMemo(() => pickList(config?.metrics, METRICS), [config]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [charIndex, setCharIndex] = useState(0);

  // Si la lista de slides cambia (ej. terminó de cargar el store-config) y el
  // índice actual quedó fuera de rango, se vuelve a 0 en vez de romper.
  useEffect(() => {
    if (currentIndex >= slides.length) setCurrentIndex(0);
  }, [slides, currentIndex]);

  // Aparición progresiva (typewriter) de la descripción, como en la versión anterior.
  useEffect(() => {
    const description = slides[currentIndex]?.description || '';
    if (charIndex < description.length) {
      const timeoutId = setTimeout(() => {
        setDisplayedText(description.slice(0, charIndex + 1));
        setCharIndex(charIndex + 1);
      }, 35);
      return () => clearTimeout(timeoutId);
    }
  }, [charIndex, currentIndex]);

  useEffect(() => {
    setDisplayedText('');
    setCharIndex(0);
  }, [currentIndex]);

  // Rotación automática de slides, respetando prefers-reduced-motion.
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;
    const intervalId = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % slides.length);
    }, 5200);
    return () => clearInterval(intervalId);
  }, [slides]);

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
          <h1>{slide.title}</h1>
          <p className="lede">{displayedText}</p>
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
        {COMMANDS.map((c) => (
          <div className="row" key={c.cmd}>
            <span className="p">{c.p}</span> {c.cmd} <span className="c">{`// ${c.note}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Inicio;
