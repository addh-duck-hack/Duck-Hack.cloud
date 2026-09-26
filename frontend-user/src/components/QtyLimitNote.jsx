// src/components/QtyLimitNote.jsx
//
// Aviso de tope de compra (useCart().limitOf). Con reason 'stock' dice
// cuántas piezas hay; con 'wholesale' (llegó al tope por pedido) invita a
// contactar a la tienda como cliente mayorista. Lo usan la tarjeta, la ficha
// y las líneas de la canasta.
import React from 'react';
import { Link } from 'react-router-dom';
import './QtyLimitNote.css';

const QtyLimitNote = ({ limit, className = '' }) => {
  const classes = `qty-limit-note ${className}`.trim();

  if (limit.reason === 'stock') {
    return (
      <p className={`${classes} qty-limit-note--stock`}>
        <i className="fa-solid fa-box-open" aria-hidden="true" />
        <span>
          {limit.max === 1 ? '¡Solo queda 1 pieza!' : `Solo hay ${limit.max} piezas disponibles.`}
        </span>
      </p>
    );
  }

  return (
    <p className={classes}>
      <i className="fa-solid fa-boxes-stacked" aria-hidden="true" />
      <span>
        Máximo {limit.purchaseLimit} por pedido. ¿Necesitas más? <Link to="/contacto">Hazte cliente mayorista</Link>
      </span>
    </p>
  );
};

export default QtyLimitNote;
