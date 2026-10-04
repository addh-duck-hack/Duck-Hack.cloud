// src/hooks/useCart.jsx
//
// Carrito en el navegador (localStorage) y, con sesión, también en el
// servidor (GET/PUT /api/cart) para que se conserve entre dispositivos y para
// el correo de carrito abandonado (módulo abandonedCart). Precios, existencias,
// cupón, puntos y envío los recalcula el backend al crear el pedido.
//
// Al iniciar sesión se unen el carrito del navegador y el guardado (se suman
// cantidades sin pasar de lo disponible); después cada cambio se guarda al
// segundo. Al cerrar sesión se vacía el del navegador (sigue en la cuenta).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { normalizeProduct } from '../utils/products';
import { getAuthHeader, useAuth } from './useAuth';

const STORAGE_KEY = 'salon.cart.v1';
const OWNER_KEY = 'salon.cart.owner.v1';

const CartContext = createContext(null);

const keyOf = (productId, variantId) => `${productId}|${variantId || '-'}`;

// Tope de una línea: existencias (de la variante si la hay) y tope por pedido.
const capOf = (line) => {
  const caps = [line.maxQty, line.purchaseLimit].filter((n) => Number.isFinite(n) && n >= 0);
  return caps.length ? Math.min(...caps) : 99;
};

export const lineFrom = (product, variant, qty) => ({
  key: keyOf(product.id, variant?.id),
  id: product.id,
  variantId: variant?.id || null,
  variantLabel: variant?.label || '',
  name: product.name,
  image: variant?.image || product.image,
  price: variant ? variant.price : product.price,
  maxQty: variant ? variant.maxQty : product.maxQty,
  purchaseLimit: product.purchaseLimit,
  qty,
});

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin almacenamiento: sigue en memoria
  }
};

const fromServer = (items) =>
  (items || [])
    .map((item) => {
      const product = normalizeProduct(item.product);
      const variant = item.variant ? product.variants.find((v) => String(v.id) === String(item.variant)) : null;
      if (item.variant && !variant) return null;
      return lineFrom(product, variant, item.quantity);
    })
    .filter(Boolean);

const merge = (base, extra) => {
  const out = base.map((l) => ({ ...l }));
  extra.forEach((line) => {
    const found = out.find((l) => l.key === line.key);
    if (found) found.qty = Math.min(found.qty + line.qty, capOf(found));
    else out.push(line);
  });
  return out.filter((l) => l.qty > 0);
};

export const CartProvider = ({ children }) => {
  const [lines, setLines] = useState(() => readJson(STORAGE_KEY, []));
  const { isAuthenticated, user } = useAuth();
  const userId = isAuthenticated ? String(user?._id || '') : '';
  const readyRef = useRef(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => writeJson(STORAGE_KEY, lines), [lines]);

  const push = useCallback(
    (current) =>
      apiFetch('/api/cart', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ items: current.map((l) => ({ product: l.id, variant: l.variantId, quantity: l.qty })) }),
      }),
    []
  );

  // Al entrar / salir de la cuenta.
  useEffect(() => {
    readyRef.current = false;
    const owner = readJson(OWNER_KEY, null);
    if (!userId) {
      if (owner) {
        setLines([]);
        writeJson(OWNER_KEY, null);
      }
      return undefined;
    }
    let cancelled = false;
    apiFetch('/api/cart', { headers: getAuthHeader() })
      .then(async (data) => {
        if (cancelled) return;
        const server = fromServer(data.items);
        // El carrito del navegador ya era de esta cuenta: manda el servidor.
        const next = owner === userId ? server : merge(server, linesRef.current);
        setLines(next);
        writeJson(OWNER_KEY, userId);
        if (owner !== userId) await push(next);
        readyRef.current = true;
      })
      .catch(() => {
        // sin conexión: se queda el del navegador
      });
    return () => {
      cancelled = true;
    };
  }, [userId, push]);

  // Cada cambio con sesión se guarda al segundo.
  useEffect(() => {
    if (!userId || !readyRef.current) return undefined;
    const timer = setTimeout(() => push(linesRef.current).catch(() => {}), 1000);
    return () => clearTimeout(timer);
  }, [lines, userId, push]);

  const add = useCallback((product, variant = null, qty = 1) => {
    const line = lineFrom(product, variant, qty);
    setLines((prev) => merge(prev, [line]));
  }, []);

  const setQty = useCallback((key, qty) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: Math.max(0, Math.min(qty, capOf(l))) } : l)).filter((l) => l.qty > 0));
  }, []);

  const remove = useCallback((key) => setLines((prev) => prev.filter((l) => l.key !== key)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      subtotal: lines.reduce((s, l) => s + l.price * l.qty, 0),
      add,
      setQty,
      remove,
      clear,
      capOf,
    }),
    [lines, add, setQty, remove, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>');
  return ctx;
};
