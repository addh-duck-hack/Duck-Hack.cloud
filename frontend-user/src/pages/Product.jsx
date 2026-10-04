// src/pages/Product.jsx — ficha: fotos, tono/tamaño (variantes), cantidad,
// favorito (aviso de "volvió a estar disponible"), reseñas aprobadas y
// formulario para calificar si la clienta ya lo recibió.
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAuthHeader, useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { useCart } from '../hooks/useCart';
import ProductCard, { FavoriteButton } from '../ui/ProductCard';
import RichText from '../ui/RichText';
import { Loading, Notice, StarInput, Stars } from '../ui/bits';
import { apiFetch } from '../utils/apiClient';
import { errorText, fmtShortDate, money } from '../utils/format';
import { listItems, normalizeProduct } from '../utils/products';

const Reviews = ({ productId }) => {
  const { isAuthenticated } = useAuth();
  const list = useApi(`/api/reviews/public?product=${productId}&limit=20`);
  const eligibility = useApi(isAuthenticated ? `/api/reviews/eligibility?product=${productId}` : null, getAuthHeader());
  const own = eligibility.data?.review;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (own) {
      setRating(own.rating);
      setComment(own.comment || '');
    }
  }, [own]);

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError('Elige de 1 a 5 estrellas.');
    setError('');
    try {
      const data = await apiFetch(own ? `/api/reviews/mine/${own._id}` : '/api/reviews', {
        method: own ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ ...(own ? {} : { product: productId }), rating, comment: comment.trim() || undefined }),
      });
      setMessage(data.message || 'Gracias. Publicaremos tu reseña cuando la revisemos.');
      eligibility.reload();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const summary = list.data?.summary;
  const items = listItems(list.data);

  return (
    <section className="section">
      <h2 className="section__title">Reseñas</h2>
      {summary?.count ? <p><Stars value={summary.average} /> {summary.average.toFixed(1)} de 5 · {summary.count} reseña{summary.count === 1 ? '' : 's'}</p> : <p className="muted">Aún no hay reseñas.</p>}
      <ul className="reviews">
        {items.map((r) => (
          <li key={r._id} className="card">
            <Stars value={r.rating} />
            {r.comment ? <p>{r.comment}</p> : null}
            <small className="muted">{r.customerName} · {fmtShortDate(r.createdAt)}</small>
          </li>
        ))}
      </ul>
      {eligibility.data?.eligible || own ? (
        <form className="card stack" onSubmit={submit}>
          <h3>{own ? 'Tu reseña' : 'Califica este producto'}</h3>
          {own?.status === 'pending' ? <small className="muted">En revisión.</small> : null}
          {own?.status === 'rejected' ? <small className="muted">No se publicó{own.rejectionReason ? `: ${own.rejectionReason}` : ''}. Puedes editarla.</small> : null}
          <StarInput value={rating} onChange={setRating} />
          <textarea rows="3" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="¿Qué te pareció?" />
          <Notice type="error">{error}</Notice>
          <Notice type="success">{message}</Notice>
          <button className="btn">{own ? 'Guardar cambios' : 'Enviar reseña'}</button>
        </form>
      ) : isAuthenticated && eligibility.data?.reason ? (
        <small className="muted">{eligibility.data.reason}</small>
      ) : null}
    </section>
  );
};

// El catálogo público no expone lo agotado (404): si la clienta llega por un
// enlace viejo, puede dejarlo en favoritos para que le avisen cuando regrese.
const FavoriteNotice = ({ productId }) => (
  <p className="fav-notice">
    <FavoriteButton productId={productId} /> Agrégalo a favoritos y te avisamos por correo cuando vuelva.
  </p>
);

const Product = () => {
  const { id } = useParams();
  const cart = useCart();
  const { data, error, isLoading } = useApi(`/api/products/public/${id}`);
  const related = listItems(useApi(`/api/products/public/${id}/related`).data).map(normalizeProduct).slice(0, 4);
  const product = data ? normalizeProduct(data.product || data) : null;
  const [variantId, setVariantId] = useState('');
  const [qty, setQty] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setVariantId('');
    setQty(1);
    setImageIndex(0);
  }, [id]);

  if (isLoading) return <div className="wrap"><Loading /></div>;
  if (error || !product) {
    return (
      <div className="wrap">
        <Notice type="error">{error?.status === 404 ? 'Este producto está agotado o ya no está a la venta.' : errorText(error)}</Notice>
        {error?.status === 404 ? <FavoriteNotice productId={id} /> : null}
        <Link to="/tienda">← Volver a la tienda</Link>
      </div>
    );
  }

  const variant = product.variants.find((v) => v.id === variantId) || null;
  const price = variant ? variant.price : product.price;
  const compareAt = variant ? variant.compareAtPrice : product.compareAtPrice;
  const maxQty = variant ? variant.maxQty : product.maxQty;
  const soldOut = product.hasVariants ? product.variants.every((v) => !v.inStock) : maxQty === 0;
  const inCart = cart.lines.find((l) => l.key === `${product.id}|${variant?.id || '-'}`)?.qty || 0;
  const cap = Math.min(...[maxQty, product.purchaseLimit].filter((n) => Number.isFinite(n)), 99);
  const room = Math.max(0, cap - inCart);
  const image = variant?.image || product.images[imageIndex] || product.image;

  const addToCart = () => {
    cart.add(product, variant, Math.min(qty, room));
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="wrap">
      <p className="crumbs"><Link to="/tienda">Tienda</Link>{product.category ? <> / <Link to={`/tienda?categoria=${product.category.slug || product.category._id}`}>{product.category.name}</Link></> : null}</p>
      <div className="product">
        <div className="product__gallery">
          <div className="product__main">
            {image ? <img src={image} alt={product.name} /> : <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />}
            <FavoriteButton productId={product.id} />
          </div>
          {product.images.length > 1 ? (
            <div className="thumbs">
              {product.images.map((src, i) => (
                <button type="button" key={src} className={i === imageIndex && !variant ? 'is-active' : ''} onClick={() => { setVariantId(''); setImageIndex(i); }}>
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="product__info">
          <h1>{product.name}</h1>
          {product.ratingCount ? <p><Stars value={product.ratingAvg} count={product.ratingCount} /></p> : null}
          <p className="price price--big">
            {product.priceFrom && !variant ? 'Desde ' : ''}{money(price)}
            {compareAt > price ? <s>{money(compareAt)}</s> : null}
          </p>
          {product.hasVariants ? (
            <div className="variants">
              <span className="label">Elige tono / presentación</span>
              <div className="chips">
                {product.variants.map((v) => (
                  <button type="button" key={v.id} disabled={!v.inStock} className={`chip ${variantId === v.id ? 'is-active' : ''}`} onClick={() => { setVariantId(v.id); setQty(1); }}>
                    {v.label}{!v.inStock ? ' · agotado' : ''}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {soldOut ? (
            <p className="notice notice--info">Agotado por ahora. Agrégalo a favoritos <i className="fa-regular fa-heart" aria-hidden="true" /> y te avisamos por correo cuando regrese.</p>
          ) : (
            <div className="buy">
              <div className="qty">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Menos">−</button>
                <span>{qty}</span>
                <button type="button" onClick={() => setQty((q) => Math.min(room || 1, q + 1))} aria-label="Más">+</button>
              </div>
              <button type="button" className="btn" disabled={(product.hasVariants && !variant) || room === 0} onClick={addToCart}>
                {added ? '¡Agregado al carrito!' : product.hasVariants && !variant ? 'Elige una opción' : room === 0 ? 'Ya tienes el máximo' : 'Agregar al carrito'}
              </button>
            </div>
          )}
          {added ? <p><Link to="/carrito">Ir al carrito →</Link></p> : null}
          <RichText html={product.description} className="product__desc" />
          {product.attributes.length ? (
            <dl className="attrs">
              {product.attributes.map((a) => (
                <React.Fragment key={a.name}><dt>{a.name}</dt><dd>{a.value}</dd></React.Fragment>
              ))}
            </dl>
          ) : null}
        </div>
      </div>

      <Reviews productId={product.id} />

      {related.length ? (
        <section className="section">
          <h2 className="section__title">También te puede gustar</h2>
          <div className="grid grid--4">{related.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </section>
      ) : null}
    </div>
  );
};

export default Product;
