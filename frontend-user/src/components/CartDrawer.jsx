// src/components/CartDrawer.jsx
//
// Canasta en panel lateral (montado en AppShell, abierto con useCart().openCart
// desde la barra, las tarjetas y la ficha). De arriba abajo: meta de envío
// gratis con barra, líneas con − n + y quitar, carrusel "Completa tu pedido"
// con productos que no están en la canasta, y pie fijo con subtotal / envío /
// total + "Finalizar compra" (→ /carrito, donde siguen cuenta y envío).
//
// Diálogo modal: se cierra con ×, Esc, clic en el fondo y al cambiar de ruta;
// bloquea el scroll de la página y devuelve el foco a quien lo abrió.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCart, formatMxn, formatOptions } from '../hooks/useCart';
import { useProducts, pickRandom } from '../hooks/useProducts';
import StoreImage from './StoreImage';
import './CartDrawer.css';

const MAX_SUGGESTIONS = 8;

// "Completa tu pedido": catálogo barajado una vez (no en cada cambio de la
// canasta, para que el carrusel no "salte") sin lo que ya está agregado.
const CartSuggestions = () => {
  const { lines, setProductQty } = useCart();
  const { products, isLoading } = useProducts();
  const railRef = useRef(null);

  const shuffled = useMemo(() => pickRandom(products, products.length), [products]);
  const inCartIds = useMemo(() => new Set(lines.map((l) => String(l.id))), [lines]);
  const suggestions = isLoading
    ? []
    : shuffled.filter((p) => !inCartIds.has(String(p.id))).slice(0, MAX_SUGGESTIONS);

  if (suggestions.length === 0) return null;

  const scrollRail = (direction) => {
    const rail = railRef.current;
    if (rail) rail.scrollBy({ left: direction * rail.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section className="cart-drawer-suggest" aria-labelledby="cart-suggest-title">
      <div className="cart-drawer-suggest-head">
        <h3 id="cart-suggest-title">Completa tu pedido</h3>
        <div>
          <button type="button" aria-label="Anteriores" onClick={() => scrollRail(-1)}>
            <i className="fas fa-chevron-left" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Siguientes" onClick={() => scrollRail(1)}>
            <i className="fas fa-chevron-right" aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul ref={railRef} className="cart-drawer-rail">
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

const CartDrawer = () => {
  const {
    lines,
    count,
    subtotal,
    shipping,
    total,
    freeShippingFrom,
    setQty,
    removeItem,
    isCartOpen,
    closeCart,
  } = useCart();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const closeButtonRef = useRef(null);
  const openerRef = useRef(null);
  // El carrusel (que pide el catálogo) se monta la primera vez que se abre el
  // panel y se queda montado: no hay petición extra en páginas donde nadie
  // abre la canasta.
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (isCartOpen) setHasOpened(true);
  }, [isCartOpen]);

  // Al cambiar de ruta se cierra (p. ej. tras abrir un producto desde el panel).
  useEffect(() => {
    closeCart();
  }, [pathname, closeCart]);

  // Abierto: Esc cierra, se bloquea el scroll y el foco va al botón cerrar;
  // al cerrar, el foco vuelve a quien lo abrió.
  useEffect(() => {
    if (!isCartOpen) return undefined;
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') closeCart();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.();
    };
  }, [isCartOpen, closeCart]);

  const missing = Math.max(0, freeShippingFrom - subtotal);
  const progress = Math.min(100, Math.round((subtotal / freeShippingFrom) * 100));

  const goToCheckout = () => {
    closeCart();
    navigate('/carrito');
  };

  return (
    <div className={`cart-drawer${isCartOpen ? ' is-open' : ''}`} aria-hidden={!isCartOpen} inert={isCartOpen ? undefined : ''}>
      <div className="cart-drawer-backdrop" onClick={closeCart} />

      <aside className="cart-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title">
        <header className="cart-drawer-header">
          <h2 id="cart-drawer-title">
            Tu canasta <span>({count})</span>
          </h2>
          <button ref={closeButtonRef} type="button" className="cart-drawer-close" aria-label="Cerrar canasta" onClick={closeCart}>
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className="cart-drawer-body">
          {lines.length > 0 ? (
            <div className="cart-drawer-goal">
              <p>
                {missing > 0 ? (
                  <span>
                    ¡Agrega <strong>{formatMxn(missing)}</strong> y tu envío es gratis!
                  </span>
                ) : (
                  <strong>¡Tu envío es gratis!</strong>
                )}
              </p>
              <span className="cart-drawer-bar" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </span>
            </div>
          ) : null}

          {lines.length === 0 ? (
            <div className="cart-drawer-empty">
              <i className="fas fa-basket-shopping" aria-hidden="true" />
              <p>Tu canasta está vacía</p>
              <Link to="/tienda" className="cart-drawer-btn cart-drawer-btn--solid" onClick={closeCart}>
                Ir a la tienda
              </Link>
            </div>
          ) : (
            <ul className="cart-drawer-lines">
              {lines.map((line) => {
                const optionsText = formatOptions(line.options);
                return (
                  <li key={line.key} className="cart-line">
                    <Link to={`/tienda/${line.id}`} className="cart-line-thumb" tabIndex={-1} aria-hidden="true">
                      <StoreImage src={line.image} alt="" label="Producto" className="cart-line-img" />
                    </Link>
                    <div className="cart-line-info">
                      <Link to={`/tienda/${line.id}`} className="cart-line-name">
                        {line.name}
                      </Link>
                      {optionsText ? <span className="cart-line-options">{optionsText}</span> : null}
                      <div className="cart-line-controls">
                        <div className="cart-line-stepper" role="group" aria-label={`Cantidad de ${line.name}`}>
                          <button type="button" aria-label="Quitar uno" onClick={() => setQty(line.key, line.qty - 1)}>
                            <i className="fas fa-minus" aria-hidden="true" />
                          </button>
                          <span aria-live="polite">{line.qty}</span>
                          <button type="button" aria-label="Agregar uno" onClick={() => setQty(line.key, line.qty + 1)}>
                            <i className="fas fa-plus" aria-hidden="true" />
                          </button>
                        </div>
                        <button type="button" className="cart-line-remove" aria-label={`Quitar ${line.name}`} onClick={() => removeItem(line.key)}>
                          <i className="fa-regular fa-trash-can" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <strong className="cart-line-total">{formatMxn(line.price * line.qty)}</strong>
                  </li>
                );
              })}
            </ul>
          )}

          {hasOpened ? <CartSuggestions /> : null}
        </div>

        {lines.length > 0 ? (
          <footer className="cart-drawer-footer">
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMxn(subtotal)}</dd>
              </div>
              <div>
                <dt>Envío</dt>
                <dd>{shipping === 0 ? 'Gratis' : formatMxn(shipping)}</dd>
              </div>
              <div className="cart-drawer-total">
                <dt>Total</dt>
                <dd>{formatMxn(total)}</dd>
              </div>
            </dl>
            <button type="button" className="cart-drawer-btn cart-drawer-btn--solid" onClick={goToCheckout}>
              Finalizar compra
            </button>
            <button type="button" className="cart-drawer-link" onClick={closeCart}>
              Seguir comprando
            </button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
};

export default CartDrawer;
