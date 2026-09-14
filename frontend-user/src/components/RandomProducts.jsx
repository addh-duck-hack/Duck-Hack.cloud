// src/components/RandomProducts.jsx
//
// Muestra una selección al azar del catálogo (useProducts) — reemplaza los
// bloques de "Presentaciones" (planes de precio) en Inicio.jsx y Services.jsx
// (ruta /precios). Solo pinta la grilla de tarjetas; cada página pone su
// propio encabezado (eyebrow/kicker + título) arriba, siguiendo su estilo.
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { formatMxn } from '../hooks/useCart';
import { iconForCategory } from './BrandMarks';
import './RandomProducts.css';

// Solo baraja lo necesario para sacar `count` elementos (no hace falta
// mezclar el arreglo completo para catálogos chicos como este).
const pickRandom = (items, count) => {
  const pool = [...items];
  const picked = [];
  while (pool.length && picked.length < count) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool[i]);
    pool.splice(i, 1);
  }
  return picked;
};

const RandomProducts = ({ count = 4 }) => {
  const { products, isLoading } = useProducts();
  // Se vuelve a sortear solo si cambia el catálogo (p.ej. al cargar del
  // backend real) — no en cada render, para que no "baraje" mientras el
  // usuario está viendo la página.
  const picks = useMemo(() => pickRandom(products, count), [products, count]);

  if (isLoading || picks.length === 0) return null;

  return (
    <div className="rp-grid">
      {picks.map((p) => (
        <Link className="rp-card" to={`/tienda/${p.id}`} key={p.id}>
          <span className="rp-fig">
            {p.image ? (
              <img src={p.image} alt={p.name} />
            ) : (
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <use href={`#${iconForCategory(p.category)}`} />
              </svg>
            )}
          </span>
          <span className="rp-name">{p.name}</span>
          {p.meta && <span className="rp-meta">{p.meta}</span>}
          <span className="rp-price">
            {formatMxn(p.price)}
            {p.compareAtPrice && <span className="was">{formatMxn(p.compareAtPrice)}</span>}
          </span>
        </Link>
      ))}
    </div>
  );
};

export default RandomProducts;
