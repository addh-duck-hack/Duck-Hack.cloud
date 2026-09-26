// src/components/checkout/StepCart.jsx — paso 1: productos de la canasta.
import React from 'react';
import { Link } from 'react-router-dom';
import CartLineItem from '../CartLineItem';

const StepCart = ({ co }) => (
  <section className="co-panel" aria-labelledby="co-step-title">
    <div className="co-panel-head">
      <h2 id="co-step-title">Tu canasta</h2>
      <Link to="/tienda" className="co-link">
        <i className="fas fa-arrow-left" aria-hidden="true" /> Seguir comprando
      </Link>
    </div>
    <ul className="co-lines">
      {co.cart.lines.map((line) => (
        <CartLineItem key={line.key} line={line} className="cart-line--page" />
      ))}
    </ul>
  </section>
);

export default StepCart;
