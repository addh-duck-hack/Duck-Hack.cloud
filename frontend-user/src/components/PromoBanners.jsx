// src/components/PromoBanners.jsx
//
// Espacio de banners de promociones (hooks/usePromoBanners.js). Va en el
// Inicio (placement "home", debajo del Hero) y en la Tienda ("shop", bajo el
// encabezado). Sin banners vigentes no pinta nada. Con varios, carrusel:
// uno a la vez, cambia solo, puntos y flechas, pausa al pasar el mouse o con
// el foco dentro. Imagen de celular (si el admin la subió) por <picture>.
// Botón según el destino: categoría o URL = enlace; cupón = copia el código y
// lleva a la tienda.
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePromoBanners, useCarousel } from '../hooks/usePromoBanners';
import { formatMxn } from '../hooks/useCart';
import './PromoBanners.css';

const BannerAction = ({ action, onCoupon, copied }) => {
  if (!action) return null;
  if (action.kind === 'coupon') {
    return (
      <div className="promo-coupon">
        <p className="promo-coupon-code">
          Usa el código <strong>{action.code}</strong> · {action.discount}
        </p>
        {action.minPurchase || action.endsAt ? (
          <p className="promo-coupon-terms">
            {[action.minPurchase ? `En compras desde ${formatMxn(action.minPurchase)}` : '', action.endsAt ? `Válido hasta el ${action.endsAt}` : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
        <button type="button" className="promo-btn" onClick={() => onCoupon(action)}>
          {copied ? '¡Código copiado!' : action.label}
        </button>
      </div>
    );
  }
  if (action.kind === 'external') {
    return (
      <a className="promo-btn" href={action.href} target="_blank" rel="noopener noreferrer">
        {action.label}
      </a>
    );
  }
  return (
    <Link className="promo-btn" to={action.to}>
      {action.label}
    </Link>
  );
};

const PromoBanners = ({ placement, className = '' }) => {
  const { banners, copyCoupon, copiedCode } = usePromoBanners(placement);
  const { index, goTo, next, prev, setPaused } = useCarousel(banners.length);
  const navigate = useNavigate();

  if (banners.length === 0) return null;

  const handleCoupon = async (action) => {
    await copyCoupon(action.code);
    // Deja ver el "¡Código copiado!" un momento antes de ir a la tienda;
    // en la propia tienda no navega.
    if (placement !== 'shop') setTimeout(() => navigate(action.to), 900);
  };

  const many = banners.length > 1;

  return (
    <section
      className={`promo-banners ${className}`.trim()}
      aria-roledescription={many ? 'carrusel' : undefined}
      aria-label="Promociones"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
    >
      <div className="promo-viewport">
        <div className="promo-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {banners.map((banner, i) => (
            <article
              key={banner.id}
              className="promo-slide"
              aria-roledescription={many ? 'diapositiva' : undefined}
              aria-label={many ? `${i + 1} de ${banners.length}` : undefined}
              aria-hidden={i !== index}
              inert={i !== index ? '' : undefined}
            >
              <picture className="promo-media">
                {banner.mobileImage ? <source media="(max-width: 700px)" srcSet={banner.mobileImage} /> : null}
                <img src={banner.image} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
              </picture>
              <div className="promo-content">
                <h2 className="promo-title">{banner.title}</h2>
                {banner.text ? <p className="promo-text">{banner.text}</p> : null}
                <BannerAction action={banner.action} onCoupon={handleCoupon} copied={banner.action?.code && copiedCode === banner.action.code} />
              </div>
            </article>
          ))}
        </div>

        {many ? (
          <>
            <button type="button" className="promo-arrow promo-arrow--prev" onClick={prev} aria-label="Promoción anterior">
              <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </button>
            <button type="button" className="promo-arrow promo-arrow--next" onClick={next} aria-label="Siguiente promoción">
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      {many ? (
        <div className="promo-dots">
          {banners.map((banner, i) => (
            <button
              key={banner.id}
              type="button"
              className={`promo-dot${i === index ? ' is-active' : ''}`}
              aria-label={`Ver promoción ${i + 1}: ${banner.title}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      ) : null}

      <p className="visually-hidden" aria-live="polite">
        {copiedCode ? `Código ${copiedCode} copiado. Pégalo en tu carrito.` : ''}
      </p>
    </section>
  );
};

export default PromoBanners;
