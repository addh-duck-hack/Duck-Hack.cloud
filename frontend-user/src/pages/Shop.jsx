// src/pages/Shop.jsx — ruta /tienda: catálogo con filtros por categoría.
//
// Imagen de cabecera a todo lo ancho que se difumina hacia el fondo (registrada
// como hero: la barra superior flota encima), encabezado + línea de envío
// gratis (umbral de useCart), pastillas de
// categoría (la elegida vive en ?categoria= para poder compartir o volver) y
// una cuadrícula de ProductCard. Pensado para un catálogo chico (10–15
// productos): sin orden ni paginación. Mientras carga muestra tarjetas
// esqueleto para que no se asome el catálogo de muestra de useProducts.
import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useProducts, groupByCategory } from '../hooks/useProducts';
import { useCart, formatMxn } from '../hooks/useCart';
import { useHeroRef } from '../hooks/useHero';
import ProductCard from '../components/ProductCard';
import shopHeaderImage from '../assets/shop-header.jpg';
import './Shop.css';

const SKELETON_COUNT = 8;

const Shop = () => {
  usePageMeta(
    'Tienda',
    'Café de altura de Xicotepec, Puebla: café en grano y molido tostado artesanalmente. Compra en línea con envío a todo México.'
  );

  const { products, isLoading } = useProducts();
  const { freeShippingFrom } = useCart();
  const [searchParams, setSearchParams] = useSearchParams();
  const heroRef = useHeroRef();

  const chapters = useMemo(() => groupByCategory(products), [products]);
  const requested = searchParams.get('categoria') || '';
  // Una categoría que ya no existe (enlace viejo) cae a "Todos".
  const active = chapters.some((c) => c.category === requested) ? requested : '';
  const visible = active ? chapters.find((c) => c.category === active).items : products;

  const selectCategory = (category) => {
    const next = new URLSearchParams(searchParams);
    if (category) next.set('categoria', category);
    else next.delete('categoria');
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      <div ref={heroRef} className="shop-banner" aria-hidden="true">
        <img src={shopHeaderImage} alt="" />
      </div>

      <section className="shop" aria-labelledby="shop-title">
        <header className="shop-header">
          <h1 id="shop-title" className="shop-title">
            Nuestra <em>tienda</em>
          </h1>
          <p className="shop-lead">Café de altura de Xicotepec, tostado artesanalmente y listo para tu taza.</p>
          <p className="shop-shipping">
            <i className="fa-solid fa-truck-fast" aria-hidden="true" />
            Envío gratis a partir de {formatMxn(freeShippingFrom)}
          </p>
        </header>

        {!isLoading && chapters.length > 1 ? (
          <nav className="shop-filters" aria-label="Categorías">
            <button
              type="button"
              className={`shop-chip${active ? '' : ' is-active'}`}
              aria-pressed={!active}
              onClick={() => selectCategory('')}
            >
              Todos <span>{products.length}</span>
            </button>
            {chapters.map(({ category, items }) => (
              <button
                key={category}
                type="button"
                className={`shop-chip${active === category ? ' is-active' : ''}`}
                aria-pressed={active === category}
                onClick={() => selectCategory(category)}
              >
                {category} <span>{items.length}</span>
              </button>
            ))}
          </nav>
        ) : null}

        {isLoading ? (
          <div className="shop-grid" aria-busy="true" aria-label="Cargando productos">
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <div key={i} className="shop-skeleton" aria-hidden="true">
                <span className="shop-skeleton-img" />
                <span className="shop-skeleton-line" />
                <span className="shop-skeleton-line shop-skeleton-line--short" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="shop-empty">
            <p>Por ahora no hay productos disponibles.</p>
            <Link to="/contacto">Escríbenos y te avisamos cuando haya café</Link>
          </div>
        ) : (
          <div className="shop-grid">
            {visible.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </>
  );
};

export default Shop;
