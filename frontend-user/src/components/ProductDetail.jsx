// src/components/ProductDetail.jsx — PROPUESTA B: ficha de producto editorial.
import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useProduct } from '../hooks/useProducts';
import { useCart, formatMxn, formatMxnLong } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../utils/apiClient';
import { iconForCategory } from './BrandMarks';
import RichText from './RichText';
import RelatedProducts from './RelatedProducts';
import './ProductDetail.css';

// Selecciones por default: el primer valor de cada grupo de opciones del
// producto (ver useProducts.js — options: [{name, values}]). Sin opciones,
// devuelve {} y no se pinta ningún selector.
const defaultOptionValues = (product) => {
  const defaults = {};
  (product?.options || []).forEach((group) => {
    if (group?.name && group.values?.length) defaults[group.name] = group.values[0];
  });
  return defaults;
};

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { product, isLoading } = useProduct(id);
  const { addItem } = useCart();
  const auth = useAuth();

  usePageMeta(product ? product.name : 'Producto', product?.description || undefined);

  const [qty, setQty] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [favoriteError, setFavoriteError] = useState('');

  useEffect(() => {
    setQty(1);
    setActiveImage(0);
    setAdded(false);
    setSelectedOptions(defaultOptionValues(product));
  }, [id, product]);

  if (isLoading && !product) {
    return (
      <section className="pd-view">
        <p className="pd-loading">Cargando…</p>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="pd-view">
        <button className="back-link" onClick={() => navigate('/tienda')}>← Volver a la carta</button>
        <h1 className="section-title" style={{ marginTop: 18 }}>No encontramos ese producto</h1>
        <p className="section-sub">Puede que ya no esté disponible. Mira el catálogo completo.</p>
        <Link className="btn btn-solid" to="/tienda">Ir a la tienda</Link>
      </section>
    );
  }

  const optionGroups = product.options || [];
  // Todas las imágenes del producto; si el backend todavía no trae varias
  // (o el producto de muestra no tiene ninguna) cae a la miniatura única.
  const images = product.images?.length ? product.images : product.image ? [product.image] : [];

  const handleOptionChange = (groupName, value) => {
    setSelectedOptions((prev) => ({ ...prev, [groupName]: value }));
  };

  const handleAdd = () => {
    addItem(product, qty, selectedOptions);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  // auth.user.favorites siempre son solo ids (nunca poblados) para que este
  // chequeo sea directo — a diferencia de "Mi cuenta > Favoritos"
  // (MiCuenta.jsx), que carga su propia copia poblada con GET /api/users/:id
  // porque ahí sí necesita name/price/images.
  const isFavorite =
    auth.isAuthenticated && (auth.user?.favorites || []).some((favId) => String(favId) === String(product.id));

  const handleToggleFavorite = async () => {
    if (!auth.isAuthenticated) {
      navigate('/login');
      return;
    }
    setFavoriteError('');
    setIsTogglingFavorite(true);
    try {
      const authHeader = { Authorization: `Bearer ${auth.token}` };
      const data = isFavorite
        ? await apiFetch(`/api/users/${auth.user._id}/favorites/${product.id}`, {
            method: 'DELETE',
            headers: authHeader,
          })
        : await apiFetch(`/api/users/${auth.user._id}/favorites`, {
            method: 'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: product.id }),
          });
      // La respuesta trae favorites poblado (ver auth.js) — se normaliza de
      // vuelta a puros ids antes de guardarlo en el contexto.
      const ids = (data.user?.favorites || []).map((f) => (typeof f === 'string' ? f : f._id));
      auth.updateUser({ favorites: ids });
    } catch (err) {
      setFavoriteError(err.message || 'No fue posible actualizar tus favoritos.');
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  const specs = [
    ['Presentación', product.meta],
    ['Origen', product.origin],
    ['Tueste', product.roast],
    ['SKU', product.sku],
  ].filter(([, v]) => v);

  return (
    <section className="pd-view">
      <button className="back-link" onClick={() => navigate('/tienda')}>← Volver a la carta</button>

      <div className="pd">
        <div className="pd-gallery">
          <div className="pd-fig">
            {images.length > 0 ? (
              <img src={images[activeImage] || images[0]} alt={product.name} />
            ) : (
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <use href={`#${iconForCategory(product.category)}`} />
              </svg>
            )}
          </div>
          {images.length > 1 && (
            <div className="pd-thumbs">
              {images.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  className={`pd-thumb ${index === activeImage ? 'active' : ''}`}
                  onClick={() => setActiveImage(index)}
                  aria-label={`Ver imagen ${index + 1} de ${product.name}`}
                  aria-current={index === activeImage}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pd-body">
          <span className="eyebrow">{product.category}</span>
          <h1 className="pd-name">{product.name}</h1>
          {/* Admite HTML básico (p, h1-h6, b, ul, etc.) escrito directo en el
              campo de descripción del admin — sanitizado por RichText.jsx,
              igual que el resto del sitio (StoreConfig). */}
          {product.description && <RichText className="pd-lede" html={product.description} />}

          {specs.length > 0 && (
            <dl className="pd-specs">
              {specs.map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}

          {/* Diferenciadores del producto (presentación, color, lo que sea) —
              uno por grupo que traiga `product.options`. Sin ese campo (todo
              producto real hoy) no se pinta nada. */}
          {optionGroups.map((group) => (
            <div className="pd-field" key={group.name}>
              <label htmlFor={`pd-opt-${group.name}`}>{group.name}</label>
              <select
                id={`pd-opt-${group.name}`}
                value={selectedOptions[group.name] || group.values[0]}
                onChange={(e) => handleOptionChange(group.name, e.target.value)}
              >
                {group.values.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          ))}

          <div className="pd-buy">
            <span className="pd-price">{formatMxnLong(product.price)}</span>
            <div className="qty">
              <button type="button" aria-label="Menos" onClick={() => setQty((q) => Math.max(1, q - 1))}>–</button>
              <span>{qty}</span>
              <button type="button" aria-label="Más" onClick={() => setQty((q) => q + 1)}>+</button>
            </div>
            <button className="btn btn-solid" onClick={handleAdd}>
              {added ? 'Añadido ✓' : 'Agregar a la canasta'}
            </button>
            <button
              type="button"
              className={`btn pd-favorite ${isFavorite ? 'active' : ''}`}
              onClick={handleToggleFavorite}
              disabled={isTogglingFavorite}
              aria-pressed={isFavorite}
            >
              {isFavorite ? '♥ En favoritos' : '♡ Agregar a favoritos'}
            </button>
          </div>

          {favoriteError ? <p className="pd-save">{favoriteError}</p> : null}

          {product.compareAtPrice && product.compareAtPrice > product.price && (
            <p className="pd-save">
              Antes {formatMxnLong(product.compareAtPrice)} — ahorras {formatMxn(product.compareAtPrice - product.price)}
            </p>
          )}
        </div>
      </div>

      <RelatedProducts excludeId={product.id} />
    </section>
  );
};

export default ProductDetail;
