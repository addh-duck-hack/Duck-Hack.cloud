// src/components/Hero.jsx
//
// Hero de Inicio: carrusel manual (sin avance automático) de
// StoreConfig.heroSlides. Cada slide muestra su media a pantalla completa, el
// título y la descripción configurados en el admin, y el botón "Ir a la
// tienda". Si la media es un video (enlace directo o YouTube) se puede
// pausar; con imagen/GIF el botón de pausa no aparece.
//
// Se registra con useHeroRef para que la barra superior flote encima.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { useHeroRef } from '../hooks/useHero';
import { sortActive } from '../utils/storeConfigLists';
import StoreImage from './StoreImage';
import './Hero.css';

const SWIPE_THRESHOLD = 50;

const isVideo = (slide) => slide.mediaType === 'video_direct' || slide.mediaType === 'video_youtube';

// youtube.com/watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID -> ID
const youtubeId = (url) => {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const match = u.pathname.match(/\/(embed|shorts|live)\/([^/?]+)/);
    return match ? match[2] : null;
  } catch {
    return null;
  }
};

const youtubeEmbedUrl = (id) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}` +
  '&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const SlideMedia = ({ slide, videoRef, onYoutubeLoad }) => {
  if (slide.mediaType === 'image' || slide.mediaType === 'gif') {
    return <StoreImage src={slide.mediaPath} alt="" label="Imagen del hero" className="hero-media" />;
  }
  if (slide.mediaType === 'video_direct' && slide.mediaUrl) {
    return (
      <video
        ref={videoRef}
        className="hero-media"
        src={slide.mediaUrl}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
    );
  }
  if (slide.mediaType === 'video_youtube') {
    const id = youtubeId(slide.mediaUrl);
    if (id) {
      return (
        <div className="hero-media hero-media--youtube" aria-hidden="true">
          <iframe
            ref={videoRef}
            src={youtubeEmbedUrl(id)}
            title="Video del hero"
            onLoad={onYoutubeLoad}
            tabIndex={-1}
            allow="autoplay; encrypted-media"
          />
        </div>
      );
    }
  }
  return <div className="img-placeholder hero-media hero-media--empty">Imagen o video del hero</div>;
};

// Reproduce o pausa el video de un slide, sea <video> o iframe de YouTube.
const setPlaying = (el, playing) => {
  if (!el) return;
  if (el.tagName === 'VIDEO') {
    if (playing) el.play().catch(() => {});
    else el.pause();
    return;
  }
  el.contentWindow?.postMessage(
    JSON.stringify({ event: 'command', func: playing ? 'playVideo' : 'pauseVideo', args: [] }),
    '*'
  );
};

const Hero = () => {
  const { config } = useStoreConfig();
  const heroRef = useHeroRef();

  const configured = sortActive(config?.heroSlides || []);
  // Sin slides en el admin: un único slide con el nombre de la tienda y el
  // recuadro de media vacío, para que el sitio no quede sin hero.
  const slides = configured.length
    ? configured
    : [{ title: config?.storeName || '', description: '', mediaType: 'none' }];

  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(prefersReducedMotion);
  const videoRefs = useRef([]);
  const touchStartX = useRef(null);

  const count = slides.length;
  const current = slides[Math.min(active, count - 1)];

  // Si el admin quita slides, no quedarse apuntando a uno inexistente.
  useEffect(() => {
    if (active > count - 1) setActive(0);
  }, [active, count]);

  // Solo el video del slide visible corre; los demás quedan en pausa.
  useEffect(() => {
    videoRefs.current.forEach((el, i) => setPlaying(el, i === active && !isPaused));
  }, [active, isPaused, count]);

  const goTo = useCallback(
    (index) => {
      setActive((index + count) % count);
      setIsPaused(prefersReducedMotion());
    },
    [count]
  );

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
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    goTo(delta < 0 ? active + 1 : active - 1);
  };

  // El iframe de YouTube solo acepta comandos cuando ya cargó.
  const onYoutubeLoad = (i) => () => setPlaying(videoRefs.current[i], i === active && !isPaused);

  return (
    <section
      ref={heroRef}
      className="hero"
      aria-roledescription="carrusel"
      aria-label="Destacados"
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {slides.map((slide, i) => {
        const isActive = i === active;
        return (
          <div
            key={`${i}-${slide.title}`}
            className={`hero-slide${isActive ? ' is-active' : ''}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${count}`}
            aria-hidden={!isActive}
            inert={isActive ? undefined : ''}
          >
            <SlideMedia
              slide={slide}
              videoRef={(el) => {
                videoRefs.current[i] = el;
              }}
              onYoutubeLoad={onYoutubeLoad(i)}
            />
            <div className="hero-shade" aria-hidden="true" />

            <div className="hero-content">
              {slide.title ? (i === 0 ? <h1 className="hero-title">{slide.title}</h1> : <h2 className="hero-title">{slide.title}</h2>) : null}
              {slide.description ? <p className="hero-description text-justify">{slide.description}</p> : null}
              <Link to="/tienda" className="hero-cta">
                Ir a la tienda
              </Link>
            </div>
          </div>
        );
      })}

      <div className="hero-controls">
        {isVideo(current) ? (
          <button
            type="button"
            className="hero-btn hero-pause"
            aria-label={isPaused ? 'Reproducir video' : 'Pausar video'}
            onClick={() => setIsPaused((p) => !p)}
          >
            <i className={`fas ${isPaused ? 'fa-play' : 'fa-pause'}`} aria-hidden="true" />
          </button>
        ) : null}

        {count > 1 ? (
          <div className="hero-nav">
            <button type="button" className="hero-btn" aria-label="Anterior" onClick={() => goTo(active - 1)}>
              <i className="fas fa-chevron-left" aria-hidden="true" />
            </button>
            <div className="hero-dots">
              {slides.map((slide, i) => (
                <button
                  key={`dot-${i}`}
                  type="button"
                  className={`hero-dot${i === active ? ' is-active' : ''}`}
                  aria-label={`Ir al slide ${i + 1}`}
                  aria-current={i === active ? 'true' : undefined}
                  onClick={() => goTo(i)}
                />
              ))}
            </div>
            <button type="button" className="hero-btn" aria-label="Siguiente" onClick={() => goTo(active + 1)}>
              <i className="fas fa-chevron-right" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default Hero;
