// src/components/RelatedProducts.jsx — "También te puede interesar": rail
// horizontal con productos elegidos al azar del catálogo, excluyendo el que
// se está viendo. Se usa desde ProductDetail.jsx.
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { formatMxn } from '../hooks/useCart';
import { iconForCategory } from './BrandMarks';
import './RelatedProducts.css';

const COUNT = 4;

// Toma `count` elementos al azar sin repetir (Fisher–Yates parcial — no hace
// falta barajar el arreglo completo para sacar unos cuantos).
const pickRandom = (list, count) => {
  const pool = [...list];
  const picked = [];
  while (pool.length > 0 && picked.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
};

const RelatedProducts = ({ excludeId }) => {
  const { products } = useProducts();

  // Se recalcula solo cuando cambia el catálogo o el producto que se está
  // viendo — no en cada render (ej. al tocar +/- de cantidad), que se vería
  // como que los productos "saltan" solos.
  const related = useMemo(
    () => pickRandom(products.filter((p) => String(p.id) !== String(excludeId)), COUNT),
    [products, excludeId]
  );

  if (related.length === 0) return null;

  return (
    <>
      <hr className="rule" />
      <section className="related">
        <span className="kicker">Más de la carta</span>
        <h2>También te puede interesar</h2>
        <div className="related-rail">
          {related.map((p) => (
            <Link className="related-card" to={`/tienda/${p.id}`} key={p.id}>
              <span className="related-fig">
                {p.image ? (
                  <img src={p.image} alt={p.name} />
                ) : (
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <use href={`#${iconForCategory(p.category)}`} />
                  </svg>
                )}
              </span>
              <span className="related-name">{p.name}</span>
              <span className="related-price">{formatMxn(p.price)}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
};

export default RelatedProducts;
