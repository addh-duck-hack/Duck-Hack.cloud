// src/components/ProductDetail.jsx — PROPUESTA B: ficha de producto editorial.
import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useProduct, GRIND_OPTIONS } from '../hooks/useProducts';
import { useCart, formatMxn, formatMxnLong } from '../hooks/useCart';
import { iconForCategory } from './BrandMarks';
import './ProductDetail.css';

const firstSentence = (text) => (text ? text.split(/(?<=\.)\s/)[0] : '');

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { product, isLoading } = useProduct(id);
  const { addItem } = useCart();

  usePageMeta(product ? product.name : 'Producto', product?.description || undefined);

  const [qty, setQty] = useState(1);
  const [grind, setGrind] = useState(GRIND_OPTIONS[0]);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setQty(1);
    setGrind(GRIND_OPTIONS[0]);
    setAdded(false);
  }, [id]);

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

  const needsGrind = product.category !== 'Accesorios';

  const handleAdd = () => {
    addItem(product, qty, needsGrind ? grind : '—');
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
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
        <div className="pd-fig">
          {product.image ? (
            <img src={product.image} alt={product.name} />
          ) : (
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <use href={`#${iconForCategory(product.category)}`} />
            </svg>
          )}
        </div>

        <div className="pd-body">
          <span className="eyebrow">{product.category}</span>
          <h1 className="pd-name">{product.name}</h1>
          {product.description && <p className="pd-lede">{product.description}</p>}
          {product.description && <div className="pd-cata">« {firstSentence(product.description).replace(/\.$/, '')} »</div>}

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

          {needsGrind && (
            <div className="pd-field">
              <label htmlFor="grind">Molienda</label>
              <select id="grind" value={grind} onChange={(e) => setGrind(e.target.value)}>
                {GRIND_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          )}

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
          </div>

          {product.compareAtPrice && product.compareAtPrice > product.price && (
            <p className="pd-save">
              Antes {formatMxnLong(product.compareAtPrice)} — ahorras {formatMxn(product.compareAtPrice - product.price)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default ProductDetail;
