// src/ui/ProductCard.jsx — tarjeta de la tienda: foto, precio, estrellas,
// favorito y "Agregar" (los productos con tonos/tamaños se eligen en la ficha).
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { useFavorites } from '../hooks/useFavorites';
import { money } from '../utils/format';
import { Stars } from './bits';

export const FavoriteButton = ({ productId }) => {
  const favorites = useFavorites();
  const navigate = useNavigate();
  const active = favorites.isFavorite(productId);
  return (
    <button
      type="button"
      className={`fav-btn ${active ? 'is-active' : ''}`}
      aria-pressed={active}
      aria-label={active ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      title={favorites.enabled ? '' : 'Inicia sesión para guardar favoritos'}
      onClick={() => (favorites.enabled ? favorites.toggle(productId) : navigate('/login'))}
    >
      <i className={active ? 'fa-solid fa-heart' : 'fa-regular fa-heart'} aria-hidden="true" />
    </button>
  );
};

const ProductCard = ({ product }) => {
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const soldOut = product.maxQty === 0;

  const onAdd = () => {
    cart.add(product, null, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <article className="card product-card">
      <FavoriteButton productId={product.id} />
      <Link to={`/tienda/${product.id}`} className="product-card__img">
        {product.image ? <img src={product.image} alt={product.name} loading="lazy" /> : <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />}
      </Link>
      <div className="product-card__body">
        {product.category?.name ? <small className="muted">{product.category.name}</small> : null}
        <h3>
          <Link to={`/tienda/${product.id}`}>{product.name}</Link>
        </h3>
        {product.ratingCount > 0 ? <Stars value={product.ratingAvg} count={product.ratingCount} /> : null}
        <p className="price">
          {product.priceFrom ? 'Desde ' : ''}
          {money(product.price)}
          {product.compareAtPrice > product.price ? <s>{money(product.compareAtPrice)}</s> : null}
        </p>
        {soldOut ? (
          <span className="tag">Agotado</span>
        ) : product.hasVariants ? (
          <Link to={`/tienda/${product.id}`} className="btn btn--ghost btn--small">
            Elegir tono / tamaño
          </Link>
        ) : (
          <button type="button" className="btn btn--small" onClick={onAdd}>
            {added ? '¡Agregado!' : 'Agregar'}
          </button>
        )}
      </div>
    </article>
  );
};

export default ProductCard;
