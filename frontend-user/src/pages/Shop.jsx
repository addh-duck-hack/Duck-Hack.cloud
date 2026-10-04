// src/pages/Shop.jsx — tienda de maquillaje: banners de la tienda, categorías
// (?categoria=slug, el destino de los banners de categoría) y búsqueda.
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import ProductCard from '../ui/ProductCard';
import PromoBanners from '../ui/PromoBanners';
import { Loading, Notice, PageTitle } from '../ui/bits';
import { errorText } from '../utils/format';
import { listItems, normalizeProduct } from '../utils/products';

const Shop = () => {
  const [params, setParams] = useSearchParams();
  const category = params.get('categoria') || '';
  const q = params.get('q') || '';
  const [search, setSearch] = useState(q);
  const categories = listItems(useApi('/api/categories/public?kind=product').data);

  const query = new URLSearchParams();
  if (category) query.set('category', category);
  if (q) query.set('q', q);
  const { data, error, isLoading } = useApi(`/api/products/public?${query}`);
  const products = listItems(data).map(normalizeProduct);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  return (
    <div className="wrap">
      <PageTitle title="Tienda" subtitle="Maquillaje y cuidado que usamos en el salón." />
      <PromoBanners placement="shop" />

      <div className="shop-tools">
        <div className="chips">
          <button type="button" className={`chip ${!category ? 'is-active' : ''}`} onClick={() => setParam('categoria', '')}>Todo</button>
          {categories.map((c) => (
            <button
              type="button"
              key={c._id}
              className={`chip ${category === c.slug || category === c._id ? 'is-active' : ''}`}
              onClick={() => setParam('categoria', c.slug || c._id)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('q', search.trim());
          }}
        >
          <input type="search" placeholder="Buscar labial, rímel…" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar productos" />
          <button className="btn btn--small" aria-label="Buscar"><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /></button>
        </form>
      </div>

      {isLoading ? <Loading /> : null}
      <Notice type="error">{error ? errorText(error) : ''}</Notice>
      {!isLoading && !error && !products.length ? <p className="muted">No encontramos productos{q ? ` para “${q}”` : ''}.</p> : null}
      <div className="grid grid--4">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </div>
  );
};

export default Shop;
