// src/components/Testimonials.jsx
//
// "Lo que dicen de nuestro café" en Inicio: StoreConfig.testimonials
// (nombre, rubro, texto, foto, enlace) como un carrusel manual de citas
// grandes, estilo editorial. Flechas, puntos, swipe y teclado; sin avance
// automático. Sin foto (o si no carga) se muestra la inicial del nombre. Si
// el testimonio trae enlace, el nombre enlaza. Sin testimonios configurados
// la sección no se muestra.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStoreConfig, resolveStoreImageUrl } from '../hooks/useStoreConfig';
import { sortActive } from '../utils/storeConfigLists';
import { htmlToText } from '../utils/htmlExcerpt';
import { externalHref } from '../utils/links';
import './Testimonials.css';

const SWIPE_THRESHOLD = 50;

const Avatar = ({ name, photoUrl }) => {
  const src = photoUrl ? (/^https?:/i.test(photoUrl) ? photoUrl : resolveStoreImageUrl(photoUrl)) : '';
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <span className="tm-avatar tm-avatar--initial" aria-hidden="true">
        {(name || '?').trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return <img className="tm-avatar" src={src} alt="" onError={() => setFailed(true)} />;
};

const Testimonials = () => {
  const { config } = useStoreConfig();
  const testimonials = sortActive(config?.testimonials || [])
    .map((t) => ({ ...t, text: htmlToText(t.description) }))
    .filter((t) => t.name && t.text);

  const [active, setActive] = useState(0);
  const touchStartX = useRef(null);
  const count = testimonials.length;

  useEffect(() => {
    if (active > count - 1) setActive(0);
  }, [active, count]);

  const goTo = useCallback((index) => setActive((index + count) % count), [count]);

  if (count === 0) return null;

  const onKeyDown = (e) => {
    if (count < 2) return;
    if (e.key === 'ArrowRight') goTo(active + 1);
    if (e.key === 'ArrowLeft') goTo(active - 1);
  };

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e) => {
    if (touchStartX.current === null || count < 2) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) >= SWIPE_THRESHOLD) goTo(delta < 0 ? active + 1 : active - 1);
  };

  return (
    <section
      className="tm"
      aria-labelledby="tm-title"
      aria-roledescription="carrusel"
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="tm-panel">
        <h2 id="tm-title" className="tm-title">
          Lo que dicen de nuestro café
        </h2>

        {/* Todas las citas comparten la misma celda: el alto lo marca la más
            larga y el panel no "salta" al cambiar. */}
        <div className="tm-slides">
          {testimonials.map((t, i) => {
            const isActive = i === active;
            const href = externalHref(t.url);
            return (
              <figure
                key={`${i}-${t.name}`}
                className={`tm-slide${isActive ? ' is-active' : ''}`}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} de ${count}`}
                aria-hidden={!isActive}
                inert={isActive ? undefined : ''}
              >
                <i className="fa-solid fa-quote-left tm-quote-mark" aria-hidden="true" />
                <blockquote className="tm-quote">
                  <p className="text-justify">{t.text}</p>
                </blockquote>
                <figcaption className="tm-author">
                  <Avatar name={t.name} photoUrl={t.photoUrl} />
                  <span className="tm-author-text">
                    {href ? (
                      <a className="tm-name" href={href} target="_blank" rel="noopener noreferrer">
                        {t.name}
                      </a>
                    ) : (
                      <span className="tm-name">{t.name}</span>
                    )}
                    {t.rubro ? <span className="tm-rubro">{t.rubro}</span> : null}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>

        {count > 1 ? (
          <div className="tm-nav">
            <button type="button" className="tm-btn" aria-label="Testimonio anterior" onClick={() => goTo(active - 1)}>
              <i className="fas fa-chevron-left" aria-hidden="true" />
            </button>
            <div className="tm-dots">
              {testimonials.map((t, i) => (
                <button
                  key={`dot-${i}`}
                  type="button"
                  className={`tm-dot${i === active ? ' is-active' : ''}`}
                  aria-label={`Ir al testimonio ${i + 1}`}
                  aria-current={i === active ? 'true' : undefined}
                  onClick={() => goTo(i)}
                />
              ))}
            </div>
            <button type="button" className="tm-btn" aria-label="Testimonio siguiente" onClick={() => goTo(active + 1)}>
              <i className="fas fa-chevron-right" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default Testimonials;
