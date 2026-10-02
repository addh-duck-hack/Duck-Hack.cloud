// src/components/ProductReviews.jsx
//
// Sección "Reseñas" de la ficha (/tienda/:id#resenas): promedio y barras por
// estrella, reseñas aprobadas ("Ver más") y, para quien recibió el producto,
// el formulario para calificar (o su reseña con su estado y "Editar"). Sin
// sesión invita a iniciarla. La lógica vive en useReviews.js.
import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useProductReviews, REVIEW_STATUS_LABELS } from '../hooks/useReviews';
import { formatDate } from '../hooks/useAccount';
import RatingStars from './RatingStars';
import './ProductReviews.css';

const STAR_LABELS = ['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'];

// Selector de 1 a 5 estrellas (radios, se puede usar con teclado).
const StarPicker = ({ value, onChange }) => (
  <fieldset className="prv-picker">
    <legend>Tu calificación</legend>
    <div className="prv-picker-stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={n <= value ? 'is-on' : ''}>
          <input type="radio" name="prv-rating" value={n} checked={value === n} onChange={() => onChange(n)} />
          <i className={n <= value ? 'fa-solid fa-star' : 'fa-regular fa-star'} aria-hidden="true" />
          <span className="visually-hidden">
            {n} {n === 1 ? 'estrella' : 'estrellas'} — {STAR_LABELS[n]}
          </span>
        </label>
      ))}
      <span className="prv-picker-label" aria-hidden="true">
        {STAR_LABELS[value] || ''}
      </span>
    </div>
  </fieldset>
);

const ReviewForm = ({ reviews }) => (
  <form className="prv-form" onSubmit={reviews.submit}>
    <h3>{reviews.isEditing ? 'Edita tu reseña' : '¿Qué te pareció?'}</h3>
    <StarPicker value={reviews.form.rating} onChange={reviews.setRating} />
    <label className="prv-field">
      Cuéntanos más (opcional)
      <textarea
        value={reviews.form.comment}
        onChange={(e) => reviews.setComment(e.target.value)}
        rows={4}
        maxLength={reviews.maxComment}
        placeholder="Sabor, aroma, molienda, cómo lo preparas…"
      />
      <small>
        {reviews.form.comment.length}/{reviews.maxComment}
      </small>
    </label>
    {reviews.formError ? (
      <p className="prv-error" role="alert">
        {reviews.formError}
      </p>
    ) : null}
    <div className="prv-form-actions">
      <button type="submit" className="pd-btn" disabled={reviews.isSaving}>
        {reviews.isSaving ? 'Enviando…' : reviews.isEditing ? 'Guardar cambios' : 'Publicar reseña'}
      </button>
      {reviews.isEditing ? (
        <button type="button" className="prv-link" onClick={reviews.cancelEditing}>
          Cancelar
        </button>
      ) : null}
    </div>
    <p className="prv-note">Tu reseña se publica cuando la tienda la revisa. Solo mostramos tu nombre y la inicial de tu apellido.</p>
  </form>
);

// Mi reseña ya enviada, con su estado.
const MyReview = ({ reviews }) => {
  const { mine } = reviews;
  return (
    <div className="prv-mine">
      <div className="prv-mine-head">
        <h3>Tu reseña</h3>
        <span className={`prv-status prv-status--${mine.status}`}>{REVIEW_STATUS_LABELS[mine.status] || mine.status}</span>
      </div>
      <RatingStars value={mine.rating} />
      {mine.comment ? <p className="prv-comment">{mine.comment}</p> : null}
      {mine.status === 'pending' ? <p className="prv-note">La publicaremos en cuanto la tienda la revise.</p> : null}
      {mine.status === 'rejected' ? (
        <p className="prv-note">
          La tienda no la publicó{mine.rejectionReason ? `: ${mine.rejectionReason}` : '.'} Puedes editarla y la revisaremos de nuevo.
        </p>
      ) : null}
      {reviews.formMessage ? (
        <p className="prv-success" role="status">
          {reviews.formMessage}
        </p>
      ) : null}
      <button type="button" className="prv-link" onClick={reviews.startEditing}>
        <i className="fa-solid fa-pen" aria-hidden="true" /> Editar mi reseña
      </button>
    </div>
  );
};

const ProductReviews = ({ productId }) => {
  const reviews = useProductReviews(productId);
  const { summary } = reviews;
  const location = useLocation();
  const sectionRef = useRef(null);

  // Al llegar con #resenas (botón "Calificar" de Mis pedidos), bajar a la
  // sección cuando ya cargó.
  useEffect(() => {
    if (location.hash === '#resenas' && !reviews.isLoading && sectionRef.current) {
      sectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash, reviews.isLoading]);

  if (!reviews.enabled) return null;

  const loginHref = `/login?next=${encodeURIComponent(`/tienda/${productId}#resenas`)}`;

  return (
    <section id="resenas" ref={sectionRef} className="prv" aria-labelledby="prv-title">
      <h2 id="prv-title" className="pd-section-title">
        Reseñas
      </h2>

      <div className="prv-layout">
        <div className="prv-aside">
          {summary.count ? (
            <div className="prv-summary">
              <p className="prv-average">
                <strong>{summary.average.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
                <span>de 5</span>
              </p>
              <RatingStars value={summary.average} size="lg" />
              <p className="prv-total">
                {summary.count} {summary.count === 1 ? 'reseña' : 'reseñas'}
              </p>
              <ul className="prv-bars" aria-label="Reseñas por estrellas">
                {[5, 4, 3, 2, 1].map((n) => {
                  const amount = summary.distribution?.[n] || 0;
                  return (
                    <li key={n}>
                      <span>
                        {n} <i className="fa-solid fa-star" aria-hidden="true" />
                      </span>
                      <span className="prv-bar" aria-hidden="true">
                        <span style={{ width: `${summary.count ? Math.round((amount / summary.count) * 100) : 0}%` }} />
                      </span>
                      <span className="prv-bar-count">
                        {amount}
                        <span className="visually-hidden"> con {n} estrellas</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : !reviews.isLoading ? (
            <p className="prv-empty">Este producto aún no tiene reseñas.</p>
          ) : null}

          {/* Calificar */}
          {!reviews.isAuthenticated ? (
            <p className="prv-cta">
              ¿Ya lo probaste? <Link to={loginHref}>Inicia sesión</Link> para dejar tu reseña.
            </p>
          ) : reviews.showForm ? (
            <ReviewForm reviews={reviews} />
          ) : reviews.mine ? (
            <MyReview reviews={reviews} />
          ) : reviews.eligibility && !reviews.eligibility.eligible ? (
            <p className="prv-cta">{reviews.eligibility.reason}</p>
          ) : null}
        </div>

        <div className="prv-list-wrap">
          {reviews.isLoading ? <p className="prv-empty">Cargando reseñas…</p> : null}
          {reviews.items.length ? (
            <ul className="prv-list">
              {reviews.items.map((r) => (
                <li key={r._id} className="prv-item">
                  <div className="prv-item-head">
                    <RatingStars value={r.rating} size="sm" />
                    <time dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
                  </div>
                  {r.comment ? <p className="prv-comment">{r.comment}</p> : null}
                  <p className="prv-author">
                    {r.customerName} <span>· Compra verificada</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          {reviews.loadError ? <p className="prv-error">{reviews.loadError}</p> : null}
          {reviews.hasMore ? (
            <button type="button" className="prv-more" onClick={reviews.loadMore} disabled={reviews.isLoadingMore}>
              {reviews.isLoadingMore ? 'Cargando…' : 'Ver más reseñas'}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default ProductReviews;
