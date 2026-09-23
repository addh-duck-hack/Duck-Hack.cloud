// src/pages/Cart.jsx — ruta /carrito. Pendiente de rediseño.
import React from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import SectionPlaceholder from '../components/SectionPlaceholder';

const Cart = () => {
  usePageMeta('Canasta');
  return <SectionPlaceholder title="Canasta" hooks="useCheckout, useCheckoutAccount" />;
};

export default Cart;
