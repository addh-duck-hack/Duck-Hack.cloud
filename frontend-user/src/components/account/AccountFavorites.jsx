// src/components/account/AccountFavorites.jsx — "Lista de deseos": los
// favoritos cruzados con el catálogo (imagen y precio vigentes; los que ya no
// están en la tienda se marcan como no disponibles).
import React from 'react';
import { Link } from 'react-router-dom';
import { formatMxn } from '../../hooks/useCart';
import StoreImage from '../StoreImage';

const AccountFavorites = ({ account }) => {
  const { favorites } = account;

  return (
    <div className="acc-section">
      <div className="acc-card">
        <div className="acc-card-head">
          <h2>Lista de deseos</h2>
        </div>
        {favorites.error ? (
          <p className="acc-alert acc-alert--error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>{favorites.error}</span>
          </p>
        ) : null}
        {favorites.list.length === 0 ? (
          <div className="acc-empty">
            <i className="fa-regular fa-heart" aria-hidden="true" />
            <p>Guarda aquí los cafés que quieras probar: toca el corazón en la ficha de cualquier producto.</p>
            <Link to="/tienda" className="acc-btn">
              Explorar la tienda
            </Link>
          </div>
        ) : (
          <ul className="acc-favorites">
            {favorites.list.map(({ id, name, product }) => {
              const needsOptions = (product?.options || []).length > 0;
              return (
                <li key={id} className={`acc-fav${product ? '' : ' is-unavailable'}`}>
                  <Link to={`/tienda/${id}`} className="acc-fav-media" tabIndex={-1} aria-hidden="true">
                    <StoreImage src={product?.image} alt="" label="Producto" className="acc-fav-img" />
                  </Link>
                  <div className="acc-fav-body">
                    {product ? (
                      <Link to={`/tienda/${id}`} className="acc-fav-name">
                        {name}
                      </Link>
                    ) : (
                      <span className="acc-fav-name">{name}</span>
                    )}
                    {product ? (
                      <span className="acc-fav-price">
                        {formatMxn(product.price)}
                        {product.compareAtPrice > product.price ? <s>{formatMxn(product.compareAtPrice)}</s> : null}
                      </span>
                    ) : (
                      <span className="acc-muted">{favorites.isLoadingCatalog ? 'Cargando…' : 'No disponible por ahora'}</span>
                    )}
                    <div className="acc-fav-actions">
                      {product && !needsOptions ? (
                        <button type="button" className="acc-btn acc-btn--small" onClick={() => favorites.addToCart(product)}>
                          Agregar
                        </button>
                      ) : null}
                      {product && needsOptions ? (
                        <Link to={`/tienda/${id}`} className="acc-btn acc-btn--small">
                          Elegir opciones
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="acc-icon-btn"
                        onClick={() => favorites.remove(id)}
                        disabled={favorites.removingId === id}
                        aria-label={`Quitar ${name} de tu lista de deseos`}
                        title="Quitar de la lista"
                      >
                        <i className="fa-solid fa-heart" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AccountFavorites;
