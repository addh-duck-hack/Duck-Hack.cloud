// src/ui/bits.jsx — piezas chicas que se repiten: estrellas, avisos, carga,
// título de página.
import React from 'react';

export const Stars = ({ value = 0, count, size = '' }) => {
  const rounded = Math.round(Number(value) * 2) / 2;
  return (
    <span className={`stars ${size}`} aria-label={`${Number(value).toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i
          key={n}
          className={rounded >= n ? 'fa-solid fa-star' : rounded >= n - 0.5 ? 'fa-solid fa-star-half-stroke' : 'fa-regular fa-star'}
          aria-hidden="true"
        />
      ))}
      {count != null ? <small>({count})</small> : null}
    </span>
  );
};

export const StarInput = ({ value, onChange }) => (
  <div className="star-input" role="radiogroup" aria-label="Calificación">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        type="button"
        key={n}
        role="radio"
        aria-checked={value === n}
        aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
        onClick={() => onChange(n)}
      >
        <i className={value >= n ? 'fa-solid fa-star' : 'fa-regular fa-star'} aria-hidden="true" />
      </button>
    ))}
  </div>
);

export const Notice = ({ type = 'info', children }) =>
  children ? (
    <p className={`notice notice--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  ) : null;

export const Loading = ({ text = 'Cargando…' }) => (
  <p className="loading">
    <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> {text}
  </p>
);

export const PageTitle = ({ title, subtitle }) => (
  <header className="page-title">
    <h1>{title}</h1>
    {subtitle ? <p>{subtitle}</p> : null}
  </header>
);
