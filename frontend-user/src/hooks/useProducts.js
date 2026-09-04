// src/hooks/useProducts.js
//
// Catálogo de la tienda. Intenta GET /api/products/public y, mientras ese
// endpoint no exista (es trabajo de backend en otra rama — ver
// docs/adr-monorepo-shared-packages.md y el plan de Café Tacita), cae al
// catálogo de muestra local. Mismo criterio de fallback que el resto del
// storefront (useStoreConfig): si el fetch falla, se usa la constante local
// para que la tienda nunca se vea vacía.
//
// Forma normalizada de cada producto:
//   { id, name, sku, description, price, compareAtPrice, category, image,
//     images, meta, origin, roast, options }
// `meta` / `origin` / `roast` / `options` son datos de ficha que hoy solo trae
// el catálogo de muestra; cuando la tienda lea del backend real quedarán
// undefined y la ficha de producto simplemente omite esas filas/selectores.
//
// `options`: diferenciadores del producto (presentación, color, lo que sea) —
// NO es un campo de Product todavía (ver packages/core-api/modules/products.js:
// name/sku/description/price/compareAtPrice/category/images/isActive nada más).
// Antes había un selector de "Molienda" fijo con una lista global
// (GRIND_OPTIONS) que aplicaba igual a cualquier tienda/producto — se quitó
// porque no era configurable desde el admin y no tenía sentido fuera de café.
// `options` es el reemplazo genérico: cada producto trae su propia lista de
// grupos `{ name, values }` (ej. Presentación: 250 g/500 g/1 kg, o en otra
// tienda Color: Azul/Verde) — ProductDetail.jsx pinta un <select> por grupo,
// sea cual sea. Vive aquí como dato de muestra hasta que se agregue a
// Product en el backend y a ProductForm.jsx en el admin (otra rama).
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { resolveStoreImageUrl } from './useStoreConfig';

// Orden de capítulos en la tienda. Cualquier categoría que el admin cree y no
// esté aquí se muestra al final, en su propio capítulo.
export const CATEGORY_ORDER = ['Café en grano', 'Café molido', 'Ediciones especiales', 'Accesorios'];

// Ejemplo de `options` compartido por los granos/molidos "de catálogo" — 1
// grupo, 3 presentaciones. Cada producto podría traer su propio grupo
// distinto (o ninguno); este helper solo evita repetir el mismo array 6 veces.
const PRESENTACION_250_500_1KG = [{ name: 'Presentación', values: ['250 g', '500 g', '1 kg'] }];

export const FALLBACK_PRODUCTS = [
  {
    id: 'CHAL340', sku: 'CHAL340', category: 'Café en grano', name: 'El Chalahuite',
    meta: 'Lavado · 340 g · grano', origin: 'Lote El Chalahuite', roast: 'Medio',
    description: 'Panela, cacao y naranja. Cuerpo redondo, acidez media.', price: 185,
    options: PRESENTACION_250_500_1KG,
  },
  {
    id: 'CAZUL340', sku: 'CAZUL340', category: 'Café en grano', name: 'Cerro Azul',
    meta: 'Lavado · 340 g · grano', origin: 'Lote Cerro Azul', roast: 'Medio',
    description: 'Caramelo, manzana y nuez. Dulzor largo.', price: 210,
    options: PRESENTACION_250_500_1KG,
  },
  {
    id: 'BLEND500', sku: 'BLEND500', category: 'Café en grano', name: 'Blend Casa',
    meta: '500 g · grano', origin: 'Blend de la casa', roast: 'Medio-alto',
    description: 'Chocolate amargo y dátil. Nuestro café de todos los días.', price: 300,
    options: PRESENTACION_250_500_1KG,
  },
  {
    id: 'DECAF250', sku: 'DECAF250', category: 'Café en grano', name: 'Descafeinado al Agua',
    meta: '250 g · grano', origin: 'Lote El Chalahuite', roast: 'Medio',
    description: 'Cacao y fruta seca. Proceso al agua, sin químicos.', price: 220,
    options: PRESENTACION_250_500_1KG,
  },
  {
    id: 'CHALG340', sku: 'CHALG340', category: 'Café molido', name: 'El Chalahuite · molido',
    meta: '340 g · molido', origin: 'Lote El Chalahuite', roast: 'Medio',
    description: 'El mismo lote lavado, molido bajo pedido antes de enviarlo.', price: 185,
    options: [{ name: 'Presentación', values: ['250 g', '500 g', '1 kg'] }, { name: 'Molienda', values: ['Prensa francesa', 'V60 / goteo', 'Espresso', 'Cafetera italiana', 'Cafetera americana'] }],
  },
  {
    id: 'BLENDG500', sku: 'BLENDG500', category: 'Café molido', name: 'Blend Casa · molido',
    meta: '500 g · molido', origin: 'Blend de la casa', roast: 'Medio-alto',
    description: 'Chocolate y dátil, listo para tu cafetera.', price: 300,
    options: [{ name: 'Presentación', values: ['250 g', '500 g', '1 kg'] }, { name: 'Molienda', values: ['Prensa francesa', 'V60 / goteo', 'Espresso', 'Cafetera italiana', 'Cafetera americana'] }],
  },
  {
    id: 'HONEY250', sku: 'HONEY250', category: 'Ediciones especiales', name: 'Honey Garnica',
    meta: 'Proceso honey · 250 g · grano', origin: 'Microlote Garnica', roast: 'Medio',
    description: 'Durazno, miel y panela. Secado con mucílago.', price: 260, compareAtPrice: 290,
  },
  {
    id: 'NAT250', sku: 'NAT250', category: 'Ediciones especiales', name: 'Natural Bourbon',
    meta: 'Proceso natural · 250 g · grano', origin: 'Microlote Bourbon', roast: 'Medio',
    description: 'Fresa, vino tinto y cacao. Fermentación en cereza.', price: 280,
  },
  {
    id: 'MICRO200', sku: 'MICRO200', category: 'Ediciones especiales', name: 'Microlote El Manantial',
    meta: '200 g · grano · 60 bolsas numeradas', origin: 'Microlote El Manantial', roast: 'Claro',
    description: 'Jazmín, mandarina y té negro. Lo mejor de la cosecha.', price: 340,
  },
  {
    id: 'PRENSA350', sku: 'PRENSA350', category: 'Accesorios', name: 'Prensa francesa 350 ml',
    meta: 'Vidrio + acero',
    description: 'Para 2 tazas. La forma más simple de empezar en casa.', price: 420,
  },
  {
    id: 'TAZABARRO', sku: 'TAZABARRO', category: 'Accesorios', name: 'Taza de barro de Xicotepec',
    meta: '220 ml · hecha a mano',
    description: 'De alfareros de la región. Cada una es distinta.', price: 150,
  },
  {
    id: 'KITCATA', sku: 'KITCATA', category: 'Accesorios', name: 'Kit de cata Tacita',
    meta: '3 microlotes de 100 g + guía', origin: 'Varios lotes', roast: 'Varía',
    description: 'Para probar la finca completa en una sentada.', price: 520,
  },
];

const normalizeApiProduct = (p) => {
  // images[] completo para la galería de ProductDetail.jsx; `image` (la
  // primera) se conserva para todo lo que solo necesita una miniatura
  // (Shop.jsx, líneas del carrito).
  const images = Array.isArray(p.images) ? p.images.map(resolveStoreImageUrl).filter(Boolean) : [];
  return {
    id: p._id || p.id,
    sku: p.sku,
    name: p.name,
    description: p.description || '',
    price: Number(p.price),
    compareAtPrice: p.compareAtPrice != null ? Number(p.compareAtPrice) : undefined,
    category: p.category || 'Café en grano',
    image: images[0] || '',
    images,
    meta: p.meta,
    origin: p.origin,
    roast: p.roast,
    // Product todavía no tiene este campo en el backend (ver comentario
    // arriba) — queda undefined para cualquier producto real, a propósito.
    options: p.options,
  };
};

export const groupByCategory = (products) => {
  const seen = new Set(products.map((p) => p.category));
  const order = [...CATEGORY_ORDER.filter((c) => seen.has(c)), ...[...seen].filter((c) => !CATEGORY_ORDER.includes(c))];
  return order.map((category) => ({ category, items: products.filter((p) => p.category === category) }));
};

export const useProducts = () => {
  const [state, setState] = useState({ products: FALLBACK_PRODUCTS, isLoading: true, isFallback: true });

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/products/public')
      .then((data) => {
        if (cancelled) return;
        const items = (data?.items || data || []).map(normalizeApiProduct).filter((p) => p.name && p.price >= 0);
        setState(
          items.length
            ? { products: items, isLoading: false, isFallback: false }
            : { products: FALLBACK_PRODUCTS, isLoading: false, isFallback: true }
        );
      })
      .catch(() => {
        if (!cancelled) setState({ products: FALLBACK_PRODUCTS, isLoading: false, isFallback: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};

export const useProduct = (id) => {
  const { products, isLoading, isFallback } = useProducts();
  const product = useMemo(() => products.find((p) => String(p.id) === String(id)) || null, [products, id]);
  return { product, isLoading, isFallback };
};
