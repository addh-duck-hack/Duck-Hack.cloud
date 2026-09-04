// src/hooks/useCart.jsx
//
// Carrito de la tienda. Estado en memoria + espejo en localStorage para que
// sobreviva a recargas y navegación. El checkout (submitOrder) sí llega al
// backend real — POST /api/orders/public (packages/core-api/modules/orders.js,
// mergeado desde feature-store-mods) — precios y disponibilidad se recalculan
// server-side, este hook nunca los manda.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/apiClient';

const STORAGE_KEY = 'tacita.cart.v1';
const FREE_SHIPPING_FROM = 600;
const FLAT_SHIPPING = 99;

const CartContext = createContext(null);

// `options` es un mapa { nombreDeGrupo: valorElegido } (ver useProducts.js —
// "Presentación", "Molienda", lo que sea que traiga el producto). Se ordena
// por nombre de grupo para que la misma combinación siempre arme la misma key
// sin importar en qué orden vinieron las entradas del objeto.
const optionsKey = (options) =>
  Object.entries(options || {})
    .filter(([, value]) => value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}:${value}`)
    .join(',');

const lineKey = (id, options) => `${id}|${optionsKey(options) || '—'}`;

export const formatOptions = (options) =>
  Object.entries(options || {})
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}: ${value}`)
    .join(' · ');

const readStored = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const CartProvider = ({ children }) => {
  const [lines, setLines] = useState(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Modo privado / almacenamiento lleno — el carrito sigue en memoria.
    }
  }, [lines]);

  const addItem = useCallback((product, qty = 1, options = {}) => {
    const key = lineKey(product.id, options);
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l));
      }
      return [
        ...prev,
        {
          key,
          id: product.id,
          name: product.name,
          meta: product.meta || '',
          category: product.category,
          image: product.image || '',
          price: Number(product.price),
          options,
          qty,
        },
      ];
    });
  }, []);

  const setQty = useCallback((key, qty) => {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: Math.max(0, qty) } : l))
        .filter((l) => l.qty > 0)
    );
  }, []);

  const removeItem = useCallback((key) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  // Envía el pedido real al storefront público. `items` es uno por renglón
  // del carrito (no se agrupan por producto): dos líneas del mismo café con
  // distinta presentación/opción llegan como dos entradas con el mismo
  // `product` — el backend las factura por separado, que es justo lo que son.
  // Las opciones elegidas (presentación, molienda, color...) no tienen campo
  // propio en Order.items (ver orders.js) porque Product tampoco lo tiene
  // todavía (ver useProducts.js), así que van resumidas en `notes` para que
  // la tienda sepa qué preparar de cada línea.
  const submitOrder = useCallback(
    async ({ customerName, customerEmail, customerPhone, shippingAddress, paymentMethod }) => {
      const linesWithOptions = lines.filter((l) => optionsKey(l.options));
      const optionsNote = linesWithOptions.length
        ? `Detalle por producto — ${linesWithOptions
            .map((l) => `${l.name} ×${l.qty}: ${formatOptions(l.options)}`)
            .join('; ')}.`
        : '';

      const payload = {
        customerName,
        customerEmail,
        paymentMethod,
        items: lines.map((l) => ({ product: l.id, quantity: l.qty })),
      };
      if (customerPhone) payload.customerPhone = customerPhone;
      if (shippingAddress) payload.shippingAddress = shippingAddress;
      if (optionsNote) payload.notes = optionsNote;

      const data = await apiFetch('/api/orders/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return data.order;
    },
    [lines]
  );

  const value = useMemo(() => {
    const count = lines.reduce((sum, l) => sum + l.qty, 0);
    const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : FLAT_SHIPPING;
    return {
      lines,
      count,
      subtotal,
      shipping,
      total: subtotal + shipping,
      freeShippingFrom: FREE_SHIPPING_FROM,
      addItem,
      setQty,
      removeItem,
      clear,
      submitOrder,
    };
  }, [lines, addItem, setQty, removeItem, clear, submitOrder]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>');
  return ctx;
};

export const formatMxn = (n) => `$${Number(n || 0).toLocaleString('es-MX')}`;
export const formatMxnLong = (n) => `${formatMxn(n)} MXN`;
