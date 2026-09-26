// src/components/ProductCard.jsx
//
// Tarjeta de producto de la tienda (reutilizable en otras listas): imagen
// cuadrada (con cruce a la segunda imagen al pasar el mouse), "Ahorra $X" si
// hay descuento, nombre, línea de atributos, precio y botón "Agregar" que se
// vuelve selector − n + cuando el producto ya está en la canasta.
//
// Atributos: los primeros CARD_ATTRIBUTES de Product.attributes (el orden del
// admin decide cuáles), cada uno "NOMBRE valor" en una línea. Sin atributos,
// se muestra un extracto de la descripción.
import React from 'react';
import { Link } from 'react-router-dom';
import { useCart, formatMxn } from '../hooks/useCart';
import { htmlToText } from '../utils/htmlExcerpt';
import { savingOf } from '../utils/price';
import StoreImage from './StoreImage';
import './ProductCard.css';

const CARD_ATTRIBUTES = 2;

const ProductCard = ({ product }) => {
  const { qtyOf, setProductQty, openCart } = useCart();
  const href = `/tienda/${product.id}`;
  const saving = savingOf(product);
  const attributes = (product.attributes || []).slice(0, CARD_ATTRIBUTES);
  const summary = attributes.length ? '' : htmlToText(product.description);
  const hoverImage = product.images?.[1];
  // Solo el catálogo de muestra trae opciones (presentación, molienda): esos
  // se eligen en la ficha, no se agregan "a ciegas" desde la tarjeta.
  const needsOptions = (product.options || []).length > 0;
  const qty = needsOptions ? 0 : qtyOf(product.id);

  return (
    <article className="product-card">
      <Link to={href} className="product-card-media" tabIndex={-1} aria-hidden="true">
        <StoreImage src={product.image} alt="" label="Imagen del producto" className="product-card-img" />
        {hoverImage ? <StoreImage src={hoverImage} alt="" className="product-card-img product-card-img--hover" /> : null}
        {saving ? <span className="product-card-badge">Ahorra {formatMxn(saving)}</span> : null}
      </Link>

      <div className="product-card-body">
        <h3 className="product-card-name">
          <Link to={href}>{product.name}</Link>
        </h3>
        {attributes.length ? (
          <dl className="product-card-specs">
            {attributes.map((attr, i) => (
              <div key={`${i}-${attr.name}`}>
                <dt>{attr.name}</dt>
                <dd title={attr.value}>{attr.value}</dd>
              </div>
            ))}
          </dl>
        ) : summary ? (
          <p className="product-card-attrs">{summary}</p>
        ) : null}

        <div className="product-card-footer">
          <p className="product-card-price">
            <strong>{formatMxn(product.price)}</strong>
            {saving ? <s>{formatMxn(product.compareAtPrice)}</s> : null}
          </p>

          {needsOptions ? (
            <Link to={href} className="product-card-add">
              Elegir opciones
            </Link>
          ) : qty > 0 ? (
            <div className="product-card-stepper" role="group" aria-label={`Cantidad de ${product.name}`}>
              <button type="button" aria-label="Quitar uno" onClick={() => setProductQty(product, qty - 1)}>
                <i className="fas fa-minus" aria-hidden="true" />
              </button>
              <span aria-live="polite">{qty}</span>
              <button type="button" aria-label="Agregar uno" onClick={() => setProductQty(product, qty + 1)}>
                <i className="fas fa-plus" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="product-card-add"
              onClick={() => {
                setProductQty(product, 1);
                openCart();
              }}
            >
              Agregar
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
