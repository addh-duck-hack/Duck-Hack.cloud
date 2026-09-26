// src/components/CartLineItem.jsx
//
// Una línea de la canasta: miniatura, nombre (a la ficha), opciones, "Ahorras
// $X", selector − n + (topado por useCart().limitOf, con QtyLimitNote al
// llegar al tope), quitar y total con el precio regular tachado si hay
// descuento. La usan el panel lateral (CartDrawer) y el paso "Canasta" del
// checkout (/carrito); `className` agrega la variante de cada uno.
import React from 'react';
import { Link } from 'react-router-dom';
import { useCart, formatMxn, formatOptions, lineSavingOf } from '../hooks/useCart';
import StoreImage from './StoreImage';
import QtyLimitNote from './QtyLimitNote';
import './CartLineItem.css';

const CartLineItem = ({ line, className = '' }) => {
  const { setQty, removeItem, limitOf } = useCart();
  const optionsText = formatOptions(line.options);
  const lineSaving = lineSavingOf(line);
  const limit = limitOf(line);
  const atLimit = limit.remaining === 0;

  return (
    <li className={`cart-line ${className}`.trim()}>
      <Link to={`/tienda/${line.id}`} className="cart-line-thumb" tabIndex={-1} aria-hidden="true">
        <StoreImage src={line.image} alt="" label="Producto" className="cart-line-img" />
      </Link>
      <div className="cart-line-info">
        <Link to={`/tienda/${line.id}`} className="cart-line-name">
          {line.name}
        </Link>
        {optionsText ? <span className="cart-line-options">{optionsText}</span> : null}
        <span className="cart-line-unit">{formatMxn(line.price)} c/u</span>
        {lineSaving ? <span className="cart-line-saving">Ahorras {formatMxn(lineSaving)}</span> : null}
        <div className="cart-line-controls">
          <div className="cart-line-stepper" role="group" aria-label={`Cantidad de ${line.name}`}>
            <button type="button" aria-label="Quitar uno" onClick={() => setQty(line.key, line.qty - 1)}>
              <i className="fas fa-minus" aria-hidden="true" />
            </button>
            <span aria-live="polite">{line.qty}</span>
            <button
              type="button"
              aria-label={atLimit ? 'Llegaste al máximo' : 'Agregar uno'}
              onClick={() => setQty(line.key, line.qty + 1)}
              disabled={atLimit}
            >
              <i className="fas fa-plus" aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="cart-line-remove" aria-label={`Quitar ${line.name}`} onClick={() => removeItem(line.key)}>
            <i className="fa-regular fa-trash-can" aria-hidden="true" />
          </button>
        </div>
        {atLimit ? <QtyLimitNote limit={limit} className="cart-line-limit" /> : null}
      </div>
      <div className="cart-line-prices">
        {lineSaving ? <s>{formatMxn(line.compareAtPrice * line.qty)}</s> : null}
        <strong className={`cart-line-total${lineSaving ? ' is-discounted' : ''}`}>{formatMxn(line.price * line.qty)}</strong>
      </div>
    </li>
  );
};

export default CartLineItem;
