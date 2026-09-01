// src/components/Inicio.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  { cmd: 'Hosting a tu medida', note: 'Planes que se adaptan a cualquier tipo de negocio, con soporte real en español.', icon: 'fas fa-server' },
  { cmd: 'Tu sitio web', note: 'Diseño y desarrollo pensado para tu marca, de principio a fin.', icon: 'fas fa-laptop-code' },
  { cmd: 'Tu aplicación', note: 'Apps nativas para iOS y Android, listas para publicarse.', icon: 'fas fa-mobile-alt' },
  { cmd: 'Tu imagen de marca', note: 'Identidad visual e imagen corporativa que te representan.', icon: 'fas fa-palette' },
];

const FALLBACK_ICON = 'fas fa-check-circle';

// Duración de cada slide proporcional a su cantidad de palabras — un timer
// fijo corta o no alcanza a mostrar texto más largo del que el admin pueda
// cargar desde /admin/store-config/home. A ritmo de lectura (~230
// palabras/min) más margen, con piso y techo para que ni un slide muy corto
// pase demasiado rápido ni uno muy largo se quede pegado.
const READ_MS_PER_WORD = 260;
const MIN_SLIDE_MS = 4800;
const MAX_SLIDE_MS = 12000;

const getSlideDuration = (slide) => {
  const words = `${slide?.title || ''} ${slide?.description || ''}`.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(MAX_SLIDE_MS, Math.max(MIN_SLIDE_MS, words * READ_MS_PER_WORD));
};

// Anima un contador de "0" al valor real cuando su tarjeta entra en el
// viewport — trabaja directo sobre el DOM vía ref (no sobre estado de React)
// para no disparar un re-render por frame; termina siempre fijando el texto
// exacto que React ya renderizó, así que no hay desajuste si React vuelve a
// pintar ese nodo después.
const animateCount = (el, rawValue, reduceMotion) => {
  if (!el || reduceMotion) return;
  const match = String(rawValue).match(/^([\d.]+)(.*)$/);
  if (!match) return;
  const target = parseFloat(match[1]);
  const suffix = match[2] || '';
  const decimals = (match[1].split('.')[1] || '').length;
  const duration = 900;
  let start = null;

  const tick = (ts) => {
    if (!start) start = ts;
    const progress = Math.min(1, (ts - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = (target * eased).toFixed(decimals) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = rawValue;
  };
  requestAnimationFrame(tick);
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

  // ---- Riel de "arranque": el riel a la izquierda se enciende por etapas
  // conforme el hero, el panel de métricas y los pasos entran en el
  // viewport; las tarjetas de métricas/pasos entran en cascada con un
  // barrido de brillo y un leve parallax al hacer scroll. ----
  const pageRef = useRef(null);
  const railFillRef = useRef(null);
  const nodeRefs = useRef([]);
  const sectionRefs = useRef([]);
  const numRefs = useRef([]);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pageEl = pageRef.current;
    const sections = sectionRefs.current.filter(Boolean);
    const nodes = nodeRefs.current.filter(Boolean);
    if (!pageEl || sections.length === 0) return undefined;

    // Los nodos del riel y el riel mismo comparten .home-view (position:
    // relative) como bloque contenedor — se posicionan a la altura real de
    // cada sección, no a una posición fija, para que sigan alineados sin
    // importar cuánto contenido tenga cada una.
    const layoutNodes = () => {
      const pageTop = pageEl.getBoundingClientRect().top;
      sections.forEach((sec, i) => {
        if (!nodes[i]) return;
        const top = sec.getBoundingClientRect().top - pageTop;
        nodes[i].style.top = `${Math.max(0, top)}px`;
      });
    };
    layoutNodes();
    window.addEventListener('resize', layoutNodes);

    const sweeper = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in-view');
          const idx = sections.indexOf(entry.target);
          if (nodes[idx]) nodes[idx].classList.add('lit');
          entry.target.querySelectorAll('.cell, .step-card').forEach((card, i) => {
            setTimeout(() => card.classList.add('sweep'), i * 90);
          });
        });
      },
      { threshold: 0.3 }
    );
    sections.forEach((sec) => sweeper.observe(sec));

    const revealTargets = pageEl.querySelectorAll('.cell, .step-card');
    const counted = new WeakSet();
    const revealer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in-view');
          const numEl = entry.target.querySelector('[data-count]');
          if (numEl && !counted.has(numEl)) {
            counted.add(numEl);
            animateCount(numEl, numEl.getAttribute('data-count'), reduceMotion);
          }
        });
      },
      { threshold: 0.25, rootMargin: '0px 0px -8% 0px' }
    );
    revealTargets.forEach((t) => revealer.observe(t));

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const doc = document.documentElement;
        const max = doc.scrollHeight - doc.clientHeight;
        const pct = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
        if (railFillRef.current) railFillRef.current.style.height = `${pct}%`;
        if (!reduceMotion) {
          pageEl.querySelectorAll('.cell').forEach((card) => {
            const r = card.getBoundingClientRect();
            const center = (r.top + r.height / 2) / window.innerHeight - 0.5;
            card.style.transform = `translateY(${center * 10}px)`;
          });
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener('resize', layoutNodes);
      window.removeEventListener('scroll', onScroll);
      sweeper.disconnect();
      revealer.disconnect();
    };
  }, [slides, metrics, commands]);

  return (
    <div className="home-view boot-page" ref={pageRef}>
      <div className="boot-rail">
        <div className="boot-rail-fill" ref={railFillRef} />
      </div>
      <div className="boot-node" ref={(el) => (nodeRefs.current[0] = el)} />
      <div className="boot-node" ref={(el) => (nodeRefs.current[1] = el)} />
      <div className="boot-node" ref={(el) => (nodeRefs.current[2] = el)} />

      <section className="hero2" ref={(el) => (sectionRefs.current[0] = el)}>
        <div className="hero2-bg" aria-hidden="true" />
        <div className="hero2-content">
          <span className="hero2-badge">duck-hack · cloud-os</span>
          <div className="term-copy" key={slide.id}>
            <h1 className="hero2-title">{slide.title}</h1>
            <p className="hero2-sub">{slide.description}</p>
          </div>
          <div className="hero2-actions">
            <Link className="btn btn-solid" to="/precios">
              Ver planes
            </Link>
            <Link className="btn" to="/contacto">
              Hablar con nosotros
            </Link>
          </div>
          {/* Las métricas (clientes activos, disponibilidad...) ya no se repiten
              aquí: se muestran justo debajo en el panel "Así trabajamos
              contigo" — repetirlas en el hero se veía como información
              duplicada a centímetros de distancia. */}
          <div className="hero2-trust">
            <span>
              <span className="dot" aria-hidden="true" />
              Soporte en español
            </span>
          </div>
          <div className="hero2-dots">
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
      </section>

      <span className="section-label">Así trabajamos contigo</span>
      <div className="panel-frame" ref={(el) => (sectionRefs.current[1] = el)}>
        <div className="panel-chrome">
          <span className="dot d1" />
          <span className="dot d2" />
          <span className="dot d3" />
          <span className="label">duck-hack — resultados en vivo</span>
        </div>
        <div className="bento">
          {metrics.map((m, i) => (
            <div className="cell" key={m.label}>
              <div className="num" data-count={m.value} ref={(el) => (numRefs.current[i] = el)}>
                {m.value}
              </div>
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
      </div>

      <span className="section-label">Qué puedes hacer con nosotros</span>
      <div className="steps" ref={(el) => (sectionRefs.current[2] = el)}>
        {commands.map((c) => (
          <div className="step-card" key={c.cmd}>
            <span className="step-icon" aria-hidden="true">
              <i className={c.icon || FALLBACK_ICON} />
            </span>
            <div>
              <strong>{c.cmd}</strong>
              <p>{c.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Inicio;
