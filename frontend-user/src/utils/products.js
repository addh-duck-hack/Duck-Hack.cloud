// src/utils/products.js — producto del catálogo público (GET /api/products/public)
// a la forma que usa el sitio. Con variantes (tono, tamaño…) cada una trae su
// precio, imagen y existencias; el precio "Desde" sale de priceRange.
import { mediaUrl } from './format';

export const normalizeProduct = (p) => {
  const images = (Array.isArray(p.images) ? p.images : []).map(mediaUrl).filter(Boolean);
  const variants = (Array.isArray(p.variants) ? p.variants : []).map((v) => ({
    id: v._id,
    label: v.label || (v.optionValues || []).join(' / '),
    price: Number(v.price),
    compareAtPrice: v.compareAtPrice != null ? Number(v.compareAtPrice) : undefined,
    image: v.image ? mediaUrl(v.image) : images[0] || '',
    inStock: Boolean(v.inStock),
    maxQty: Number.isFinite(Number(v.maxQty)) ? Number(v.maxQty) : 0,
  }));
  const min = Number(p.priceRange?.min);
  const max = Number(p.priceRange?.max);
  const hasRange = variants.length > 0 && Number.isFinite(min);
  return {
    id: p._id || p.id,
    name: p.name,
    description: p.description || '',
    price: hasRange ? min : Number(p.price),
    priceFrom: hasRange && Number.isFinite(max) && max > min,
    compareAtPrice: !hasRange && p.compareAtPrice != null ? Number(p.compareAtPrice) : undefined,
    category: typeof p.category === 'object' && p.category ? p.category : null,
    image: images[0] || '',
    images,
    attributes: (p.attributes || []).filter((a) => a?.name && a?.value),
    maxQty: Number.isFinite(Number(p.maxQty)) && p.maxQty !== null ? Number(p.maxQty) : undefined,
    purchaseLimit: Number(p.purchaseLimit) > 0 ? Number(p.purchaseLimit) : undefined,
    ratingAvg: Number(p.ratingAvg) || 0,
    ratingCount: Number(p.ratingCount) || 0,
    variants,
    hasVariants: variants.length > 0,
  };
};

export const listItems = (data) => (Array.isArray(data) ? data : data?.items || []);
