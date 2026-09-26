// src/hooks/useCart.jsx
//
// Carrito de la tienda. Estado en memoria + espejo en localStorage para que
// sobreviva a recargas y navegación. El checkout (submitOrder) sí llega al
// backend real — POST /api/orders/public (packages/core-api/modules/orders.js,
// mergeado desde feature-store-mods) — precios y disponibilidad se recalculan
// server-side, este hook nunca los manda.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { getAuthHeader } from './useAuth';

const STORAGE_KEY = 'tacita.cart.v1';
const FREE_SHIPPING_FROM = 600;
const FLAT_SHIPPING = 99;
// Tope de unidades por producto si el catálogo no trae el suyo (backend
// anterior o catálogo de muestra). El real viene de
// packages/core-api/lib/purchaseLimits.js vía GET /api/products/public.
const DEFAULT_PURCHASE_LIMIT = 10;

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

// Precio anterior de un producto, solo si de verdad es mayor al actual.
const compareAtOf = (product) => {
  const compare = Number(product?.compareAtPrice);
  return compare > Number(product?.price) ? compare : undefined;
};

// Límites de compra de un producto o de una línea de la canasta:
// `purchaseLimit` = tope por pedido (más que eso es mayoreo, por contacto) y
// `maxQty` = min(existencias, purchaseLimit), ambos calculados por el backend.
export const purchaseLimitOf = (item) => Number(item?.purchaseLimit) || DEFAULT_PURCHASE_LIMIT;
export const maxQtyOf = (item) => {
  const max = Number(item?.maxQty);
  return item?.maxQty != null && Number.isFinite(max) ? Math.max(0, Math.min(max, purchaseLimitOf(item))) : purchaseLimitOf(item);
};

// Unidades de un producto en la canasta, sumando todas sus líneas (el mismo
// café en dos presentaciones cuenta junto, igual que en el backend).
const unitsIn = (lines, productId, exceptKey) =>
  lines
    .filter((l) => String(l.id) === String(productId) && l.key !== exceptKey)
    .reduce((sum, l) => sum + l.qty, 0);

// Ahorro de una línea de la canasta (precio anterior − actual) × cantidad.
export const lineSavingOf = (line) =>
  line?.compareAtPrice > line?.price ? (line.compareAtPrice - line.price) * line.qty : 0;

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
  // Panel lateral de la canasta (CartDrawer): estado de UI compartido para que
  // la barra, las tarjetas y la ficha lo abran.
  const [isCartOpen, setIsCartOpen] = useState(false);
  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Modo privado / almacenamiento lleno — el carrito sigue en memoria.
    }
  }, [lines]);

  // Nunca deja pasar del tope del producto (maxQtyOf) sumando sus líneas:
  // lo que no cabe simplemente no se agrega.
  const addItem = useCallback((product, qty = 1, options = {}) => {
    const key = lineKey(product.id, options);
    setLines((prev) => {
      const room = Math.max(0, maxQtyOf(product) - unitsIn(prev, product.id));
      const toAdd = Math.min(qty, room);
      if (toAdd <= 0) return prev;
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        // Se refrescan el precio anterior y los topes por si la línea venía
        // de antes de guardarlos (o cambiaron el descuento o el inventario).
        return prev.map((l) =>
          l.key === key
            ? {
                ...l,
                qty: l.qty + toAdd,
                compareAtPrice: compareAtOf(product),
                maxQty: product.maxQty,
                purchaseLimit: product.purchaseLimit,
              }
            : l
        );
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
          compareAtPrice: compareAtOf(product),
          maxQty: product.maxQty,
          purchaseLimit: product.purchaseLimit,
          options,
          qty: toAdd,
        },
      ];
    });
  }, []);

  const setQty = useCallback((key, qty) => {
    setLines((prev) =>
      prev
        .map((l) =>
          l.key === key
            ? { ...l, qty: Math.max(0, Math.min(qty, maxQtyOf(l) - unitsIn(prev, l.id, l.key))) }
            : l
        )
        .filter((l) => l.qty > 0)
    );
  }, []);

  // Cuánto más se puede agregar de un producto (o línea) y por qué se topa:
  // `reason` es 'stock' si lo limita el inventario y 'wholesale' si llegó al
  // tope por pedido (la UI ofrece contacto como cliente mayorista).
  const limitOf = useCallback(
    (item) => {
      const max = maxQtyOf(item);
      const purchaseLimit = purchaseLimitOf(item);
      const units = unitsIn(lines, item.id);
      return {
        max,
        purchaseLimit,
        units,
        remaining: Math.max(0, max - units),
        reason: max < purchaseLimit ? 'stock' : 'wholesale',
      };
    },
    [lines]
  );

  const removeItem = useCallback((key) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  // Cantidad y ajuste de la línea SIN opciones de un producto — para el
  // selector +/− de las tarjetas de la tienda (ProductCard). Un producto con
  // opciones se agrega desde su ficha, con su propia línea por combinación.
  const qtyOf = useCallback(
    (productId) => lines.find((l) => l.key === lineKey(productId, {}))?.qty || 0,
    [lines]
  );

  const setProductQty = useCallback(
    (product, qty) => {
      const key = lineKey(product.id, {});
      if (lines.some((l) => l.key === key)) setQty(key, qty);
      else if (qty > 0) addItem(product, qty, {});
    },
    [lines, setQty, addItem]
  );

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
      // shippingAddress ahora es un objeto (recipientName/phone/street/...,
      // ver useCheckout.js) — solo se manda si de verdad se llenó algo, para no
      // guardar un objeto de puros campos vacíos en pedidos de "pickup".
      const hasShippingAddress = shippingAddress && Object.values(shippingAddress).some(Boolean);
      if (hasShippingAddress) payload.shippingAddress = shippingAddress;
      if (optionsNote) payload.notes = optionsNote;

      // Bearer opcional: si hay sesión, el backend vincula el pedido a la
      // cuenta (packages/core-api/modules/orders.js#attachOptionalCustomer);
      // sin token, con uno vencido/inválido, o si el usuario nunca inició
      // sesión (p.ej. solo se registró, que no deja token porque falta
      // verificar el correo), el pedido se crea igual como invitado, sin
      // error.
      const data = await apiFetch('/api/orders/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      return data.order;
    },
    [lines]
  );

  const value = useMemo(() => {
    const count = lines.reduce((sum, l) => sum + l.qty, 0);
    const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    // Ahorro por descuentos (precio anterior − actual) y el subtotal a precio
    // regular, para mostrarlos en la canasta y el checkout.
    const savings = lines.reduce((sum, l) => sum + lineSavingOf(l), 0);
    const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : FLAT_SHIPPING;
    return {
      lines,
      count,
      subtotal,
      shipping,
      total: subtotal + shipping,
      savings,
      regularSubtotal: subtotal + savings,
      freeShippingFrom: FREE_SHIPPING_FROM,
      addItem,
      setQty,
      removeItem,
      clear,
      qtyOf,
      setProductQty,
      limitOf,
      submitOrder,
      isCartOpen,
      openCart,
      closeCart,
    };
  }, [lines, addItem, setQty, removeItem, clear, qtyOf, setProductQty, limitOf, submitOrder, isCartOpen, openCart, closeCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>');
  return ctx;
};

export const formatMxn = (n) => `$${Number(n || 0).toLocaleString('es-MX')}`;
export const formatMxnLong = (n) => `${formatMxn(n)} MXN`;
