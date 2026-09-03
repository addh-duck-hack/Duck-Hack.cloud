// src/components/Shop.jsx — PROPUESTA B: la tienda como "carta" editorial.
//
// Lee del catálogo (useProducts): intenta el endpoint público y, mientras no
// exista, usa el catálogo de muestra. Cada renglón enlaza a la ficha /tienda/:id.
import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useProducts, groupByCategory } from '../hooks/useProducts';
import { formatMxn } from '../hooks/useCart';
import { iconForCategory } from './BrandMarks';
import './Shop.css';

const Shop = () => {
  usePageMeta(
    'Tienda',
    'Café de especialidad de Café Tacita: lotes en grano y molido, ediciones especiales y accesorios. Tostado bajo pedido, envíos a todo México.'
  );

  const { products, isLoading } = useProducts();
  const chapters = groupByCategory(products);

  return (
    <section className="shop-view">
      <div className="shop-intro">
        <span className="eyebrow">La carta</span>
        <h1 className="section-title">Nuestra tienda</h1>
        <p>
          Todo se tuesta bajo pedido y se muele a tu método el día que lo enviamos. Envío a todo México en 2 a 4
          días; gratis a partir de {formatMxn(600)}.
        </p>
      </div>

      {isLoading && <p className="shop-loading">Cargando catálogo…</p>}

      <div className="shop-catalog">
        {chapters.map(({ category, items }) => (
          <section className="chapter" key={category}>
            <div className="chapter-head">
              <h2>{category}</h2>
              <span className="chapter-c">
                {items.length} {items.length === 1 ? 'opción' : 'opciones'}
              </span>
            </div>
            <div className="menu-list">
              {items.map((p) => (
                <Link className="menu-item" to={`/tienda/${p.id}`} key={p.id}>
                  <span className="mfig">
                    {p.image ? (
                      <img src={p.image} alt={p.name} />
                    ) : (
                      <svg viewBox="0 0 100 100" aria-hidden="true">
                        <use href={`#${iconForCategory(p.category)}`} />
                      </svg>
                    )}
                  </span>
                  <span className="minfo">
                    <span className="mname">{p.name}</span>
                    {p.meta && <span className="mmeta">{p.meta}</span>}
                    {p.description && <span className="mnotes">{p.description}</span>}
                  </span>
                  <span className="mprice">
                    {formatMxn(p.price)}
                    {p.compareAtPrice && <span className="was">{formatMxn(p.compareAtPrice)}</span>}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
};

export default Shop;
