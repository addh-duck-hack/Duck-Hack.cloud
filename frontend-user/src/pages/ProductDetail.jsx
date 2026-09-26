// src/pages/ProductDetail.jsx — ruta /tienda/:id: ficha de producto.
//
// Migas → bloque de compra (galería fija a la izquierda; a la derecha nombre,
// atributos destacados, precio/ahorro, opciones, cantidad + "Agregar a la
// canasta", favoritos, aviso de envío gratis y sellos de confianza) →
// Descripción (HTML vía RichText) | Ficha con todos los atributos →
// relacionados. La lógica vive en useProductDetail / useRelatedProducts.
import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useProductDetail } from '../hooks/useProductDetail';
import { useRelatedProducts } from '../hooks/useProducts';
import { useCart, formatMxn } from '../hooks/useCart';
import { htmlToText } from '../utils/htmlExcerpt';
import { savingOf } from '../utils/price';
import StoreImage from '../components/StoreImage';
import RichText from '../components/RichText';
import ProductCard from '../components/ProductCard';
import './ProductDetail.css';

const TRUST_BADGES = [
  { icon: 'fa-solid fa-fire-burner', label: 'Tostado bajo pedido' },
  { icon: 'fa-solid fa-truck-fast', label: 'Envío a todo México' },
  { icon: 'fa-solid fa-seedling', label: 'Café 100% de origen' },
];

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useProductDetail(id);
  const { product, catalog, isLoading, images, activeImage, setActiveImage, highlights, attributes } = detail;
  const { lines, subtotal, freeShippingFrom, openCart } = useCart();
  const related = useRelatedProducts(catalog, product);

  const summary = htmlToText(product?.description);
  usePageMeta(product ? product.name : 'Producto', summary ? summary.slice(0, 160) : undefined);

  if (isLoading) {
    return (
      <div className="pd pd--loading" aria-busy="true" aria-label="Cargando producto">
        <span className="pd-skeleton pd-skeleton--img" />
        <div className="pd-skeleton-lines">
          <span className="pd-skeleton pd-skeleton--title" />
          <span className="pd-skeleton pd-skeleton--line" />
          <span className="pd-skeleton pd-skeleton--line pd-skeleton--short" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <section className="pd-missing">
        <h1>Este producto no está disponible</h1>
        <p>Puede que se haya agotado o que ya no esté en la tienda.</p>
        <Link to="/tienda" className="pd-btn">
          Ver la tienda
        </Link>
      </section>
    );
  }

  const saving = savingOf(product);
  const hasDescription = Boolean(summary);
  const hasSpecs = attributes.length > 0;
  const mainImage = images[activeImage] || images[0];

  // Envío gratis: mientras el producto no está en la canasta se proyecta con
  // la cantidad elegida; ya agregado, se muestra el estado real de la canasta
  // (sumarlo otra vez lo contaría doble).
  const inCart = lines.some((l) => String(l.id) === String(product.id));
  const projected = subtotal + (inCart ? 0 : product.price * detail.qty);
  const missing = Math.max(0, freeShippingFrom - projected);
  const progress = Math.min(100, Math.round((projected / freeShippingFrom) * 100));

  const onFavorite = async () => {
    const done = await detail.toggleFavorite();
    if (!done) navigate('/login');
  };

  return (
    <>
      <nav className="pd-crumbs" aria-label="Ruta">
        <Link to="/tienda">Tienda</Link>
        {product.category ? (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/tienda?categoria=${encodeURIComponent(product.category)}`}>{product.category}</Link>
          </>
        ) : null}
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <section className="pd" aria-labelledby="pd-title">
        {/* ---- Galería ---- */}
        <div className="pd-gallery">
          <div className="pd-main-image">
            <StoreImage src={mainImage} alt={product.name} label="Imagen del producto" className="pd-img" />
            {saving ? <span className="pd-badge">Ahorra {formatMxn(saving)}</span> : null}
          </div>
          {images.length > 1 ? (
            <div className="pd-thumbs" role="group" aria-label="Imágenes del producto">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  className={`pd-thumb${i === activeImage ? ' is-active' : ''}`}
                  aria-label={`Ver imagen ${i + 1}`}
                  aria-pressed={i === activeImage}
                  onClick={() => setActiveImage(i)}
                >
                  <StoreImage src={src} alt="" className="pd-thumb-img" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* ---- Compra ---- */}
        <div className="pd-info">
          <h1 id="pd-title" className="pd-title">
            {product.name}
          </h1>

          {highlights.length ? (
            <dl className="pd-highlights">
              {highlights.map((attr, i) => (
                <div key={`${i}-${attr.name}`}>
                  <dt>{attr.name}</dt>
                  <dd>{attr.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <p className="pd-price">
            <strong>{formatMxn(product.price)}</strong>
            {saving ? (
              <>
                <s>{formatMxn(product.compareAtPrice)}</s>
                <span className="pd-saving">Ahorra {formatMxn(saving)}</span>
              </>
            ) : null}
          </p>

          {detail.optionGroups.map((group) => (
            <label key={group.name} className="pd-option">
              {group.name}
              <select value={detail.selectedOptions[group.name] || ''} onChange={(e) => detail.setOption(group.name, e.target.value)}>
                {group.values.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <div className="pd-buy">
            <div className="pd-stepper" role="group" aria-label="Cantidad">
              <button type="button" aria-label="Quitar uno" onClick={() => detail.setQty(detail.qty - 1)} disabled={detail.qty <= 1}>
                <i className="fas fa-minus" aria-hidden="true" />
              </button>
              <span aria-live="polite">{detail.qty}</span>
              <button type="button" aria-label="Agregar uno" onClick={() => detail.setQty(detail.qty + 1)}>
                <i className="fas fa-plus" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              className={`pd-btn pd-add${detail.added ? ' is-added' : ''}`}
              onClick={() => {
                detail.addToCart();
                openCart();
              }}
            >
              {detail.added ? (
                <>
                  <i className="fas fa-check" aria-hidden="true" /> Agregado
                </>
              ) : (
                'Agregar a la canasta'
              )}
            </button>

            <button
              type="button"
              className={`pd-fav${detail.isFavorite ? ' is-active' : ''}`}
              aria-label={detail.isFavorite ? 'Quitar de mi lista de deseos' : 'Guardar en mi lista de deseos'}
              aria-pressed={detail.isFavorite}
              onClick={onFavorite}
              disabled={detail.isTogglingFavorite}
            >
              <i className={`${detail.isFavorite ? 'fa-solid' : 'fa-regular'} fa-heart`} aria-hidden="true" />
            </button>
          </div>

          <p className="pd-after-add" aria-live="polite">
            {detail.added ? (
              <Link to="/carrito">
                Ver canasta <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            ) : null}
          </p>
          {detail.favoriteError ? <p className="pd-error">{detail.favoriteError}</p> : null}

          <div className="pd-shipping">
            <p>
              <i className="fa-solid fa-truck-fast" aria-hidden="true" />
              {missing > 0 ? (
                <span>
                  Te faltan <strong>{formatMxn(missing)}</strong> para envío gratis
                </span>
              ) : (
                <strong>¡Tu pedido tiene envío gratis!</strong>
              )}
            </p>
            <span className="pd-shipping-bar" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </span>
          </div>

          <ul className="pd-trust">
            {TRUST_BADGES.map((badge) => (
              <li key={badge.label}>
                <i className={badge.icon} aria-hidden="true" />
                {badge.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Descripción | Ficha ---- */}
      {hasDescription || hasSpecs ? (
        <section className={`pd-details${hasDescription && hasSpecs ? '' : ' pd-details--single'}`}>
          {hasDescription ? (
            <div>
              <h2 className="pd-section-title">Descripción</h2>
              <RichText html={product.description} className="pd-description" />
            </div>
          ) : null}
          {hasSpecs ? (
            <div>
              <h2 className="pd-section-title">Ficha del producto</h2>
              <dl className="pd-specs">
                {attributes.map((attr, i) => (
                  <div key={`${i}-${attr.name}`}>
                    <dt>{attr.name}</dt>
                    <dd>{attr.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ---- Relacionados ---- */}
      {related.length ? (
        <section className="pd-related" aria-labelledby="pd-related-title">
          <h2 id="pd-related-title" className="pd-related-title">
            También te puede <em>interesar</em>
          </h2>
          <div className="pd-related-grid">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
};

export default ProductDetail;
