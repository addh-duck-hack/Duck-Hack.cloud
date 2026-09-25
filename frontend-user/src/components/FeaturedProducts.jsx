// src/components/FeaturedProducts.jsx
//
// "Descubre nuestros productos" en Inicio: 6 productos al azar del catálogo
// público. El primero va destacado (dos columnas, imagen de fondo); los demás
// en tarjetas con nombre, una línea de descripción, precio e imagen cuadrada.
// Si un producto tiene compareAtPrice mayor al precio, muestra "Ahorra $X" y
// el precio anterior tachado. La última tarjeta, "Todos los productos",
// lleva a /tienda con un collage de imágenes del resto del catálogo.
//
// Toma el catálogo una sola vez con useProducts y sortea aquí (pickRandom):
// useRandomProducts haría una segunda petición y aquí también se necesita el
// catálogo completo para el collage. No se pinta mientras carga, para que
// los productos de muestra no aparezcan un instante antes que los reales.
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useProducts, pickRandom } from '../hooks/useProducts';
import { formatMxn } from '../hooks/useCart';
import { htmlToText } from '../utils/htmlExcerpt';
import StoreImage from './StoreImage';
import './FeaturedProducts.css';

const PICK_COUNT = 6;
const COLLAGE_COUNT = 3;

const savingOf = (product) =>
  product.compareAtPrice > product.price ? product.compareAtPrice - product.price : 0;

// `stacked`: el precio anterior va debajo del actual (tarjetas normales, donde
// comparte la fila con la imagen); en la destacada va al lado.
const PriceTag = ({ product, stacked = false }) => {
  const hasDiscount = savingOf(product) > 0;
  return (
    <p className={`fp-price${stacked ? ' fp-price--stacked' : ''}`}>
      <strong>{formatMxn(product.price)}</strong>
      {hasDiscount ? <s>{formatMxn(product.compareAtPrice)}</s> : null}
    </p>
  );
};

const FeaturedCard = ({ product }) => {
  const saving = savingOf(product);
  return (
    <Link to={`/tienda/${product.id}`} className="fp-card fp-card--featured">
      <StoreImage src={product.image} alt="" label="Imagen del producto" className="fp-featured-img" />
      <span className="fp-featured-shade" aria-hidden="true" />
      <div className="fp-featured-top">
        <h3 className="fp-name">{product.name}</h3>
        {saving ? <span className="fp-badge">Ahorra {formatMxn(saving)}</span> : null}
      </div>
      <PriceTag product={product} />
    </Link>
  );
};

const ProductCard = ({ product }) => {
  const description = htmlToText(product.description);
  const saving = savingOf(product);
  return (
    <Link to={`/tienda/${product.id}`} className="fp-card">
      <h3 className="fp-name">{product.name}</h3>
      {description ? <p className="fp-desc">{description}</p> : null}
      {saving ? <span className="fp-badge fp-badge--soft">Ahorra {formatMxn(saving)}</span> : null}
      <div className="fp-bottom">
        <PriceTag product={product} stacked />
        <StoreImage src={product.image} alt="" label="Imagen del producto" className="fp-img" />
      </div>
    </Link>
  );
};

const FeaturedProducts = () => {
  const { products, isLoading } = useProducts();

  const picks = useMemo(() => pickRandom(products, PICK_COUNT), [products]);
  const collage = useMemo(() => {
    const pickedIds = new Set(picks.map((p) => String(p.id)));
    // Primero productos que no están en la cuadrícula; si el catálogo es chico
    // y no alcanzan, se completa con los que sí se muestran.
    const others = products.filter((p) => p.image && !pickedIds.has(String(p.id)));
    const shown = picks.filter((p) => p.image);
    return [...others, ...shown].slice(0, COLLAGE_COUNT);
  }, [products, picks]);

  if (isLoading || picks.length === 0) return null;

  const [featured, ...rest] = picks;

  return (
    <section className="fp" aria-labelledby="fp-title">
      <h2 id="fp-title" className="fp-title">
        Descubre nuestros productos
      </h2>

      <div className="fp-grid">
        <FeaturedCard product={featured} />
        {rest.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}

        <Link to="/tienda" className="fp-card fp-card--all">
          <span className="fp-all-title">
            Todos los productos <i className="fa-regular fa-circle-right" aria-hidden="true" />
          </span>
          <span className="fp-collage" aria-hidden="true">
            {(collage.length ? collage : [null, null, null]).map((p, i) => (
              <StoreImage key={p ? p.id : i} src={p?.image} alt="" label="Producto" className="fp-collage-img" />
            ))}
          </span>
        </Link>
      </div>
    </section>
  );
};

export default FeaturedProducts;
