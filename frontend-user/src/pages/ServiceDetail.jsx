// src/pages/ServiceDetail.jsx — página de un servicio (/servicios/:id):
// descripción completa, precio y duración, botón para agendarlo, fotos de
// resultados y reseñas de quienes ya lo tomaron.
// - Fotos: GET /api/services/public/:id/media — solo de citas cuya clienta
//   autorizó subirlas al sitio (el salón lo marca en el panel).
// - Reseñas: GET /api/reviews/public?service= — calificaciones aprobadas de
//   las citas que incluyeron este servicio.
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import RichText from '../ui/RichText';
import { Loading, Notice, Stars } from '../ui/bits';
import { apiFetch } from '../utils/apiClient';
import { errorText, fmtDuration, fmtShortDate, mediaUrl, money } from '../utils/format';
import { listItems } from '../utils/products';
import { NotFound } from './Info';

const REVIEWS_PAGE = 6;

// Visor a pantalla completa: flechas y Escape.
const Lightbox = ({ items, index, onClose, onMove }) => {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onMove(1);
      if (e.key === 'ArrowLeft') onMove(-1);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, onMove]);
  const item = items[index];
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Foto del servicio" onClick={onClose}>
      <button type="button" className="lightbox__close" onClick={onClose} aria-label="Cerrar"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
      {items.length > 1 ? (
        <>
          <button type="button" className="lightbox__nav lightbox__nav--prev" onClick={(e) => { e.stopPropagation(); onMove(-1); }} aria-label="Anterior"><i className="fa-solid fa-chevron-left" aria-hidden="true" /></button>
          <button type="button" className="lightbox__nav lightbox__nav--next" onClick={(e) => { e.stopPropagation(); onMove(1); }} aria-label="Siguiente"><i className="fa-solid fa-chevron-right" aria-hidden="true" /></button>
        </>
      ) : null}
      <div className="lightbox__body" onClick={(e) => e.stopPropagation()}>
        {item.kind === 'video' ? (
          <video src={mediaUrl(item.path)} controls autoPlay playsInline />
        ) : (
          <img src={mediaUrl(item.path)} alt="Resultado del servicio" />
        )}
        <small>{index + 1} de {items.length}</small>
      </div>
    </div>
  );
};

const Gallery = ({ serviceId }) => {
  const { data } = useApi(`/api/services/public/${serviceId}/media?limit=24`);
  const items = listItems(data);
  const [open, setOpen] = useState(null);
  const move = useCallback((delta) => setOpen((i) => (i + delta + items.length) % items.length), [items.length]);
  const close = useCallback(() => setOpen(null), []);
  if (!items.length) return null;
  return (
    <section className="section">
      <h2 className="section__title">Resultados</h2>
      <p className="muted">Fotos de clientas que nos permitieron compartirlas.</p>
      <ul className="service-gallery">
        {items.map((item, i) => (
          <li key={item.path}>
            <button type="button" onClick={() => setOpen(i)} aria-label={`Ver ${item.kind === 'video' ? 'video' : 'foto'} ${i + 1}`}>
              {item.kind === 'video' ? (
                <>
                  <video src={mediaUrl(item.path)} muted playsInline preload="metadata" />
                  <i className="fa-solid fa-play service-gallery__play" aria-hidden="true" />
                </>
              ) : (
                <img src={mediaUrl(item.path)} alt="" loading="lazy" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {open !== null ? <Lightbox items={items} index={open} onClose={close} onMove={move} /> : null}
    </section>
  );
};

const Reviews = ({ serviceId, first }) => {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setItems(listItems(first));
    setPage(1);
  }, [first]);

  const summary = first?.summary;
  if (!summary?.count) {
    return (
      <section className="section">
        <h2 className="section__title">Reseñas</h2>
        <p className="muted">Aún no hay reseñas de este servicio. Después de tu cita te pediremos tu opinión por correo.</p>
      </section>
    );
  }

  const loadMore = async () => {
    setLoadingMore(true);
    setError('');
    try {
      const data = await apiFetch(`/api/reviews/public?service=${serviceId}&limit=${REVIEWS_PAGE}&page=${page + 1}`);
      setItems((prev) => [...prev, ...listItems(data)]);
      setPage((p) => p + 1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="section">
      <h2 className="section__title">Reseñas</h2>
      <div className="review-summary">
        <div className="review-summary__score">
          <strong>{summary.average.toFixed(1)}</strong>
          <Stars value={summary.average} />
          <small className="muted">{summary.count} reseña{summary.count === 1 ? '' : 's'}</small>
        </div>
        <ul className="review-summary__bars">
          {[5, 4, 3, 2, 1].map((n) => (
            <li key={n}>
              <span>{n} <i className="fa-solid fa-star" aria-hidden="true" /></span>
              <span className="bar"><span style={{ width: `${(summary.distribution[n] / summary.count) * 100}%` }} /></span>
              <small>{summary.distribution[n]}</small>
            </li>
          ))}
        </ul>
      </div>
      <ul className="reviews">
        {items.map((r) => (
          <li key={r._id} className="card">
            <Stars value={r.rating} />
            {r.comment ? <p>{r.comment}</p> : null}
            <small className="muted">
              {r.customerName} · {fmtShortDate(r.createdAt)}
              {r.services?.length > 1 ? ` · ${r.services.join(' + ')}` : ''}
            </small>
          </li>
        ))}
      </ul>
      <Notice type="error">{error}</Notice>
      {items.length < summary.count ? (
        <button type="button" className="btn btn--ghost" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Cargando…' : 'Ver más reseñas'}
        </button>
      ) : null}
    </section>
  );
};

const ServiceDetail = () => {
  const { id } = useParams();
  const { data: service, error, isLoading } = useApi(`/api/services/public/${id}`);
  const reviews = useApi(`/api/reviews/public?service=${id}&limit=${REVIEWS_PAGE}`);

  useEffect(() => {
    if (service?.name) document.title = `${service.name} · Servicios`;
  }, [service?.name]);

  if (isLoading) return <div className="wrap"><Loading /></div>;
  if (error?.status === 404 || error?.code === 'SERVICE_NOT_FOUND' || error?.code === 'INVALID_OBJECT_ID') return <NotFound />;
  if (error || !service) return <div className="wrap"><Notice type="error">{errorText(error)}</Notice></div>;

  const summary = reviews.data?.summary;
  return (
    <div className="wrap">
      <p className="crumbs">
        <Link to="/servicios">Servicios</Link>
        {service.category ? <> / {service.category.name}</> : null}
      </p>
      <div className="product service-detail">
        <div className="product__main">
          {service.image ? <img src={mediaUrl(service.image)} alt={service.name} /> : <i className="fa-solid fa-spa" aria-hidden="true" />}
        </div>
        <div className="product__info">
          <h1>{service.name}</h1>
          {summary?.count ? (
            <a href="#resenas" className="service-detail__rating"><Stars value={summary.average} count={summary.count} /></a>
          ) : null}
          <p className="service-detail__facts">
            <span><i className="fa-regular fa-clock" aria-hidden="true" /> {fmtDuration(service.durationMin)}</span>
            <strong className="price price--big">{service.priceFrom ? 'Desde ' : ''}{money(service.price)}</strong>
          </p>
          {service.bookableOnline !== false ? (
            <Link className="btn" to={`/agendar?servicio=${service._id}`}>Agendar este servicio</Link>
          ) : (
            <p className="notice notice--info">Este servicio se agenda por teléfono o WhatsApp.</p>
          )}
          {service.description ? <RichText html={service.description} className="product__desc" /> : null}
        </div>
      </div>
      <Gallery serviceId={service._id} />
      <div id="resenas">
        {reviews.isLoading ? <Loading /> : <Reviews serviceId={service._id} first={reviews.data} />}
      </div>
    </div>
  );
};

export default ServiceDetail;
