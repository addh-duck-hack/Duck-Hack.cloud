// src/components/CartSuggestions.jsx
//
// "Completa tu pedido": carrusel con productos del catálogo que no están en
// la canasta, para agregarlos sin salir (+ agrega 1; los que tienen opciones
// llevan a su ficha). El catálogo se baraja una vez (no en cada cambio de la
// canasta, para que el carrusel no "salte"). Lo usan el panel lateral y el
// paso "Canasta" del checkout; cuántas tarjetas caben a la vista lo decide la
// variable CSS --suggest-cols del contenedor.
import React, { useId, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart, formatMxn } from '../hooks/useCart';
import { useProducts, pickRandom } from '../hooks/useProducts';
import StoreImage from './StoreImage';
import './CartSuggestions.css';

const MAX_SUGGESTIONS = 8;

const CartSuggestions = ({ title = 'Completa tu pedido', className = '' }) => {
  const { lines, setProductQty, limitOf } = useCart();
  const { products, isLoading } = useProducts();
  const railRef = useRef(null);
  const titleId = useId();

  const shuffled = useMemo(() => pickRandom(products, products.length), [products]);
  const inCartIds = useMemo(() => new Set(lines.map((l) => String(l.id))), [lines]);
  const suggestions = isLoading
    ? []
    : shuffled.filter((p) => !inCartIds.has(String(p.id)) && limitOf(p).remaining > 0).slice(0, MAX_SUGGESTIONS);

  if (suggestions.length === 0) return null;

  const scrollRail = (direction) => {
    const rail = railRef.current;
    if (rail) rail.scrollBy({ left: direction * rail.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section className={`cart-suggestions ${className}`.trim()} aria-labelledby={titleId}>
      <div className="cart-suggestions-head">
        <h3 id={titleId}>{title}</h3>
        <div>
          <button type="button" aria-label="Anteriores" onClick={() => scrollRail(-1)}>
            <i className="fas fa-chevron-left" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Siguientes" onClick={() => scrollRail(1)}>
            <i className="fas fa-chevron-right" aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul ref={railRef} className="cart-suggestions-rail">
        {suggestions.map((product) => {
          const needsOptions = (product.options || []).length > 0;
          return (
            <li key={product.id} className="cart-suggest">
              <Link to={`/tienda/${product.id}`} className="cart-suggest-media" tabIndex={-1} aria-hidden="true">
                <StoreImage src={product.image} alt="" label="Producto" className="cart-suggest-img" />
              </Link>
              <Link to={`/tienda/${product.id}`} className="cart-suggest-name">
                {product.name}
              </Link>
              <div className="cart-suggest-foot">
                <span>{formatMxn(product.price)}</span>
                {needsOptions ? (
                  <Link to={`/tienda/${product.id}`} className="cart-suggest-add" aria-label={`Elegir opciones de ${product.name}`}>
                    <i className="fas fa-arrow-right" aria-hidden="true" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="cart-suggest-add"
                    aria-label={`Agregar ${product.name}`}
                    onClick={() => setProductQty(product, 1)}
                  >
                    <i className="fas fa-plus" aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default CartSuggestions;
