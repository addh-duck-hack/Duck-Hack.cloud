// src/components/RatingStars.jsx
//
// Estrellas de solo lectura con medias estrellas (promedio de reseñas, p. ej.
// 4.5). `count` opcional: "(12)". Sin calificación no pinta nada.
import React from 'react';
import './RatingStars.css';

const RatingStars = ({ value, count, size = 'md', className = '' }) => {
  const rating = Number(value);
  if (!(rating > 0)) return null;
  // Al medio más cercano: 4.3 → 4.5, 4.2 → 4.
  const rounded = Math.round(rating * 2) / 2;
  const label = `${rating.toLocaleString('es-MX', { maximumFractionDigits: 1 })} de 5 estrellas`;
  return (
    <span className={`rating-stars rating-stars--${size} ${className}`.trim()}>
      <span className="rating-stars-icons" role="img" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <i
            key={n}
            className={n <= rounded ? 'fa-solid fa-star' : n - 0.5 === rounded ? 'fa-solid fa-star-half-stroke' : 'fa-regular fa-star'}
            aria-hidden="true"
          />
        ))}
      </span>
      {count ? (
        <span className="rating-stars-count">
          ({count}
          <span className="visually-hidden"> {count === 1 ? 'reseña' : 'reseñas'}</span>)
        </span>
      ) : null}
    </span>
  );
};

export default RatingStars;
