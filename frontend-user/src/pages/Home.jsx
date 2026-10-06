// src/pages/Home.jsx — portada: hero, promociones, servicios, especialistas,
// productos destacados, testimonios y horario/ubicación.
import React from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { activeSorted, useStoreConfig } from '../hooks/useStoreConfig';
import { HoursList } from '../ui/Layout';
import ProductCard from '../ui/ProductCard';
import PromoBanners from '../ui/PromoBanners';
import RichText from '../ui/RichText';
import { Stars } from '../ui/bits';
import { fmtDuration, mediaUrl, money } from '../utils/format';
import { htmlExcerpt } from '../utils/htmlExcerpt';
import { listItems, normalizeProduct } from '../utils/products';

const Hero = () => {
  const { config } = useStoreConfig();
  const slide = activeSorted(config?.heroSlides)[0];
  const media = slide ? mediaUrl(slide.mediaPath || slide.mediaUrl) : '';
  return (
    <section className="hero">
      {media && slide.mediaType === 'video' ? (
        <video className="hero__media" src={media} autoPlay muted loop playsInline />
      ) : media ? (
        <img className="hero__media" src={media} alt="" />
      ) : null}
      <div className="hero__body wrap">
        <h1>{slide?.title || config?.storeName || 'Tu salón de belleza'}</h1>
        {slide?.description ? <RichText html={slide.description} className="hero__text" /> : <p className="hero__text">Cabello, uñas, maquillaje y la tienda con los productos que usamos en cabina.</p>}
        <div className="hero__actions">
          <Link className="btn" to="/agendar">Agendar cita</Link>
          <Link className="btn btn--ghost" to="/tienda">Ver tienda</Link>
        </div>
      </div>
    </section>
  );
};

// Tarjeta de servicio (Inicio y Servicios): un extracto de la descripción en
// texto plano; la imagen y el nombre llevan a su página (/servicios/:id) con
// la descripción completa, fotos y reseñas.
export const ServiceCard = ({ service }) => {
  const to = `/servicios/${service._id}`;
  const excerpt = htmlExcerpt(service.description, 150);
  return (
    <article className="card service-card">
      {service.image ? (
        <Link to={to} className="service-card__media" tabIndex={-1} aria-hidden="true">
          <img src={mediaUrl(service.image)} alt="" loading="lazy" />
        </Link>
      ) : null}
      <div className="service-card__body">
        <h3><Link to={to} className="service-card__link">{service.name}</Link></h3>
        {excerpt ? <p className="muted service-card__excerpt">{excerpt}</p> : null}
        <p className="service-card__meta">
          <span><i className="fa-regular fa-clock" aria-hidden="true" /> {fmtDuration(service.durationMin)}</span>
          <strong>{service.priceFrom ? 'Desde ' : ''}{money(service.price)}</strong>
        </p>
        <div className="service-card__actions">
          {service.bookableOnline !== false ? (
            <Link className="btn btn--small" to={`/agendar?servicio=${service._id}`}>Agendar</Link>
          ) : (
            <small className="muted">Agenda por teléfono o WhatsApp</small>
          )}
          <Link className="service-card__more" to={to}>Ver detalles <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
        </div>
      </div>
    </article>
  );
};

const Specialists = () => {
  const { data } = useApi('/api/appointments/specialists/public');
  const items = listItems(data);
  if (!items.length) return null;
  return (
    <section className="section wrap">
      <h2 className="section__title">Nuestro equipo</h2>
      <div className="grid grid--4">
        {items.map((s) => (
          <article key={s._id} className="card person">
            {s.photoUrl ? <img src={mediaUrl(s.photoUrl)} alt="" loading="lazy" /> : <span className="avatar">{s.name.charAt(0)}</span>}
            <h3>{s.name}</h3>
            {s.bio ? <RichText html={s.bio} className="muted" /> : null}
          </article>
        ))}
      </div>
    </section>
  );
};

const Testimonials = () => {
  const { config } = useStoreConfig();
  const items = activeSorted(config?.testimonials).slice(0, 6);
  if (!items.length) return null;
  return (
    <section className="section section--soft">
      <div className="wrap">
        <h2 className="section__title">Lo que dicen nuestras clientas</h2>
        <div className="grid grid--3">
          {items.map((t, i) => (
            <blockquote key={t._id || i} className="card testimonial">
              {t.rating ? <Stars value={t.rating} /> : null}
              <RichText html={t.description} />
              <footer>
                <strong>{t.name}</strong>
                {t.rubro ? <small className="muted"> · {t.rubro}</small> : null}
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
};

const Home = () => {
  const { config } = useStoreConfig();
  const services = listItems(useApi('/api/services/public').data).slice(0, 6);
  const featured = useApi('/api/products/public?featured=true').data;
  const latest = useApi('/api/products/public').data;
  const products = (listItems(featured).length ? listItems(featured) : listItems(latest)).slice(0, 4).map(normalizeProduct);
  const loc = config?.location || {};

  return (
    <>
      <Hero />
      <div className="wrap">
        <PromoBanners placement="home" />
      </div>

      {services.length ? (
        <section className="section wrap">
          <div className="section__head">
            <h2 className="section__title">Servicios</h2>
            <Link to="/servicios">Ver todos →</Link>
          </div>
          <div className="grid grid--3">
            {services.map((s) => <ServiceCard key={s._id} service={s} />)}
          </div>
        </section>
      ) : null}

      <Specialists />

      {products.length ? (
        <section className="section wrap">
          <div className="section__head">
            <h2 className="section__title">De nuestra tienda</h2>
            <Link to="/tienda">Ver tienda →</Link>
          </div>
          <div className="grid grid--4">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      ) : null}

      <Testimonials />

      <section className="section wrap visit">
        <div>
          <h2 className="section__title">Visítanos</h2>
          {loc.address ? <p>{loc.address}</p> : null}
          {loc.mapsUrl || (loc.lat != null && loc.lng != null) ? (
            <a className="btn btn--ghost btn--small" href={loc.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer">
              Cómo llegar
            </a>
          ) : null}
        </div>
        <div>
          <h3>Horario</h3>
          <HoursList hours={config?.businessHours} />
        </div>
      </section>
    </>
  );
};

export default Home;
