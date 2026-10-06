// src/hooks/usePromoBanners.js
//
// Banners de promociones del admin (packages/core-api/modules/promoBanners.js),
// sin UI. `placement`: "home" (Inicio) o "shop" (Tienda); el backend incluye
// también los marcados para "Inicio y tienda", ya filtrados por fechas y sin
// los que tienen un destino que ya no sirve (categoría oculta, cupón vencido…).
//
// Cada banner trae su destino resuelto en `action`:
//   - category → enlace a /tienda?categoria=<nombre> (el filtro de Shop.jsx)
//   - coupon   → copia el código y lleva a /tienda (en la tienda solo copia;
//                se pega en el carrito)
//   - url      → enlace interno (empieza con "/") o externo (pestaña nueva)
//   - none     → sin botón
// Si el endpoint falla, simplemente no hay banners: la página se ve igual.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { resolveStoreImageUrl } from './useStoreConfig';

const isAbsolute = (value) => /^(https?:|blob:|data:)/.test(value || '');
const imageUrl = (path) => (path ? (isAbsolute(path) ? path : resolveStoreImageUrl(path)) : '');

const formatEndsAt = (value) =>
  value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }) : '';

const actionOf = (banner, placement) => {
  const target = banner.target || { type: 'none' };
  const label = banner.buttonLabel || '';
  if (target.type === 'category') {
    return { kind: 'link', to: `/tienda?categoria=${encodeURIComponent(target.name)}`, label: label || `Ver ${target.name}` };
  }
  if (target.type === 'coupon') {
    return {
      kind: 'coupon',
      to: '/tienda',
      code: target.code,
      discount: target.label,
      minPurchase: target.minPurchase,
      endsAt: formatEndsAt(target.endsAt),
      // En la propia tienda no navega: solo copia.
      label: label || (placement === 'shop' ? 'Copiar código' : 'Copiar código e ir a la tienda'),
    };
  }
  if (target.type === 'url' && target.url) {
    const internal = target.url.startsWith('/') && !target.url.startsWith('//');
    return internal
      ? { kind: 'link', to: target.url, label: label || 'Ver más' }
      : { kind: 'external', href: target.url, label: label || 'Ver más' };
  }
  return null;
};

const toBanner = (raw, placement) => ({
  id: raw._id,
  title: raw.title,
  text: raw.text || '',
  image: imageUrl(raw.image),
  mobileImage: imageUrl(raw.mobileImage),
  action: actionOf(raw, placement),
});

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export const usePromoBanners = (placement) => {
  const [banners, setBanners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState('');
  const resetTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiFetch(`/api/promo-banners/public?placement=${encodeURIComponent(placement)}`)
      .then((data) => {
        if (!cancelled) setBanners((data?.items || []).map((raw) => toBanner(raw, placement)));
      })
      .catch(() => {
        if (!cancelled) setBanners([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [placement]);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  // Copia el código del cupón; `copiedCode` queda unos segundos para el aviso.
  const copyCoupon = useCallback(async (code) => {
    const ok = await copyText(code);
    if (ok) {
      setCopiedCode(code);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopiedCode(''), 4000);
    }
    return ok;
  }, []);

  return { banners, isLoading, copyCoupon, copiedCode };
};

// Rotación automática del carrusel: índice actual, ir a uno, siguiente /
// anterior y pausa (mouse encima, foco dentro o pestaña oculta). Sin rotación
// si hay un solo banner o el usuario pidió menos movimiento.
export const useCarousel = (count, intervalMs = 6000) => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (count < 2 || paused || reduceMotion) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % count);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [count, paused, intervalMs]);

  const goTo = useCallback((i) => setIndex(((i % count) + count) % count), [count]);
  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + count) % count), [count]);

  return { index, goTo, next, prev, setPaused };
};
