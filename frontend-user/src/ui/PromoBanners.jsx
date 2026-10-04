// src/ui/PromoBanners.jsx — banners de promoción vigentes
// (GET /api/promo-banners/public?placement=home|shop). El backend ya oculta
// los vencidos y los que apuntan a una categoría o cupón que dejó de servir.
// Destino: categoría → la tienda filtrada; cupón → muestra el código para
// copiarlo en el carrito; url → enlace externo o interno.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fmtShortDate, mediaUrl, money } from '../utils/format';
import { listItems } from '../utils/products';

const isInternal = (url) => url.startsWith('/');

const BannerAction = ({ banner }) => {
  const [copied, setCopied] = useState(false);
  const t = banner.target || {};
  const label = banner.buttonLabel;
  if (!label || t.type === 'none') return null;
  if (t.type === 'category') {
    return <Link className="btn" to={`/tienda?categoria=${encodeURIComponent(t.slug || t.categoryId)}`}>{label}</Link>;
  }
  if (t.type === 'coupon') {
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(t.code);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    };
    return (
      <div className="banner-coupon">
        <button type="button" className="coupon-code" onClick={copy} title="Copiar código">
          {t.code} <i className={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'} aria-hidden="true" />
        </button>
        <Link className="btn" to="/tienda">{label}</Link>
        {t.minPurchase ? <small>Compra mínima {money(t.minPurchase)}</small> : null}
      </div>
    );
  }
  if (t.type === 'url' && t.url) {
    return isInternal(t.url) ? (
      <Link className="btn" to={t.url}>{label}</Link>
    ) : (
      <a className="btn" href={t.url} target="_blank" rel="noreferrer">{label}</a>
    );
  }
  return null;
};

const PromoBanners = ({ placement }) => {
  const { data } = useApi(`/api/promo-banners/public?placement=${placement}`);
  const banners = listItems(data);
  if (!banners.length) return null;
  return (
    <section className="banners">
      {banners.map((b) => (
        <article key={b._id} className={`banner ${b.image ? 'has-image' : ''}`}>
          {b.image ? (
            <picture>
              {b.mobileImage ? <source media="(max-width: 640px)" srcSet={mediaUrl(b.mobileImage)} /> : null}
              <img src={mediaUrl(b.image)} alt="" />
            </picture>
          ) : null}
          <div className="banner__body">
            <h2>{b.title}</h2>
            {b.text ? <p>{b.text}</p> : null}
            {b.target?.type === 'coupon' && b.target.label ? <p className="banner__label">{b.target.label}</p> : null}
            <BannerAction banner={b} />
            {b.endsAt ? <small className="banner__ends">Válido hasta el {fmtShortDate(b.endsAt)}</small> : null}
          </div>
        </article>
      ))}
    </section>
  );
};

export default PromoBanners;
