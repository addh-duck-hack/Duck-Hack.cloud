// src/components/CartDrawer.jsx
//
// Canasta en panel lateral (montado en AppShell, abierto con useCart().openCart
// desde la barra, las tarjetas y la ficha). De arriba abajo: meta de envío
// gratis con barra, líneas (CartLineItem), carrusel "Completa tu pedido"
// (CartSuggestions) y pie fijo con subtotal / envío / total + "Finalizar
// compra" (→ /carrito, el checkout en 4 pasos).
//
// Diálogo modal: se cierra con ×, Esc, clic en el fondo y al cambiar de ruta;
// bloquea el scroll de la página y devuelve el foco a quien lo abrió.
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCart, formatMxn } from '../hooks/useCart';
import CartLineItem from './CartLineItem';
import CartSuggestions from './CartSuggestions';
import './CartDrawer.css';

const CartDrawer = () => {
  const {
    lines,
    count,
    subtotal,
    shipping,
    total,
    savings,
    regularSubtotal,
    shippingEnabled,
    freeShippingFrom,
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

  // Meta de envío gratis: solo si la tienda cobra envío y tiene un mínimo.
  const hasGoal = shippingEnabled && Boolean(freeShippingFrom);
  const missing = hasGoal ? Math.max(0, freeShippingFrom - subtotal) : 0;
  const progress = hasGoal ? Math.min(100, Math.round((subtotal / freeShippingFrom) * 100)) : 0;

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
          {lines.length > 0 && hasGoal ? (
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
              {lines.map((line) => (
                <CartLineItem key={line.key} line={line} />
              ))}
            </ul>
          )}

          {hasOpened ? <CartSuggestions /> : null}
        </div>

        {lines.length > 0 ? (
          <footer className="cart-drawer-footer">
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMxn(savings ? regularSubtotal : subtotal)}</dd>
              </div>
              {savings ? (
                <div className="cart-drawer-discount">
                  <dt>Descuentos</dt>
                  <dd>−{formatMxn(savings)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Envío</dt>
                <dd>{shipping === 0 ? 'Gratis' : formatMxn(shipping)}</dd>
              </div>
              <div className="cart-drawer-total">
                <dt>Total</dt>
                <dd>{formatMxn(total)}</dd>
              </div>
            </dl>
            {savings ? (
              <p className="cart-drawer-savings">
                <i className="fa-solid fa-tag" aria-hidden="true" />
                <span>
                  ¡Ahorras <strong>{formatMxn(savings)}</strong> en este pedido!
                </span>
              </p>
            ) : null}
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
