// src/hooks/useProductDetail.js
//
// Estado de la ficha de producto (/tienda/:id): opciones elegidas, cantidad,
// galería, "agregar a la canasta" y favoritos. Sin UI. La cantidad nunca
// pasa de lo que aún cabe en la canasta (`limit.remaining`, ver
// useCart().limitOf: existencias y tope por pedido).
//
// Con variantes (useProducts.js#variantFor), lo elegido en los selectores
// decide la variante: su precio, su imagen y sus existencias son las que se
// muestran y se agregan (`sellable`). Una combinación inexistente o agotada
// deja `unavailable` en true y no se puede agregar.
import { useEffect, useMemo, useState } from 'react';
import { useProduct, variantFor } from './useProducts';
import { useCart } from './useCart';
import { useAuth } from './useAuth';
import { apiFetch } from '../utils/apiClient';

const ADDED_FEEDBACK_MS = 1600;
const HIGHLIGHT_COUNT = 2;

// Selección por default: con variantes, la primera disponible; sin ellas, el
// primer valor de cada grupo de opciones (ver useProducts.js — options:
// [{ name, values }]).
const defaultOptionValues = (product) => {
  const defaults = {};
  const groups = product?.options || [];
  const firstAvailable = (product?.variants || []).find((v) => v.inStock);
  groups.forEach((group, i) => {
    if (!group?.name || !group.values?.length) return;
    defaults[group.name] = firstAvailable ? firstAvailable.optionValues[i] : group.values[0];
  });
  return defaults;
};

export const useProductDetail = (id) => {
  const { product, products: catalog, isLoading } = useProduct(id);
  const { addItem, limitOf } = useCart();
  const auth = useAuth();

  const [qty, setQty] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [favoriteError, setFavoriteError] = useState('');

  useEffect(() => {
    setQty(1);
    setActiveImage(0);
    setAdded(false);
    setSelectedOptions(defaultOptionValues(product));
  }, [id, product]);

  useEffect(() => {
    if (!added) return undefined;
    const timer = setTimeout(() => setAdded(false), ADDED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [added]);

  const variant = useMemo(() => variantFor(product, selectedOptions), [product, selectedOptions]);
  const hasVariants = Boolean(product?.variants?.length);
  const unavailable = hasVariants && (!variant || !variant.inStock);
  // Lo que realmente se vende con la selección actual.
  const sellable = useMemo(() => {
    if (!product || !variant) return product;
    return {
      ...product,
      variantId: variant.id,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      maxQty: variant.maxQty,
      image: variant.image || product.image,
      priceFrom: false,
    };
  }, [product, variant]);

  const limit = sellable ? limitOf(sellable) : null;
  const remaining = limit && !unavailable ? limit.remaining : 0;

  // Si lo que cabe baja (se agregó a la canasta, cambió el producto), la
  // cantidad elegida se recorta — nunca por debajo de 1.
  useEffect(() => {
    setQty((q) => Math.min(q, Math.max(1, remaining)));
  }, [remaining]);

  const optionGroups = product?.options || [];
  // Todas las imágenes; si el producto solo trae una miniatura se usa esa.
  // La imagen propia de la variante elegida va primero.
  const baseImages = product?.images?.length ? product.images : product?.image ? [product.image] : [];
  const images = variant?.image ? [variant.image, ...baseImages.filter((src) => src !== variant.image)] : baseImages;

  // Al cambiar de variante se vuelve a la primera imagen (la de la variante).
  useEffect(() => {
    setActiveImage(0);
  }, [variant?.id]);

  const setOption = (groupName, value) => {
    setSelectedOptions((prev) => ({ ...prev, [groupName]: value }));
  };

  // ¿Este valor, con lo demás que ya está elegido, da una variante con
  // existencias? Sirve para marcar "agotado" en los selectores. Sin variantes
  // todo está disponible.
  const isOptionAvailable = (groupName, value) => {
    if (!hasVariants) return true;
    const candidate = variantFor(product, { ...selectedOptions, [groupName]: value });
    return Boolean(candidate?.inStock);
  };

  const addToCart = () => {
    if (!product || remaining === 0) return;
    addItem(product, Math.min(qty, remaining), selectedOptions, variant);
    setAdded(true);
  };

  // auth.user.favorites siempre son solo ids (nunca poblados) para que este
  // chequeo sea directo.
  const isFavorite =
    Boolean(product) &&
    auth.isAuthenticated &&
    (auth.user?.favorites || []).some((favId) => String(favId) === String(product.id));

  // Devuelve false si no hay sesión, para que la UI decida (p.ej. mandar a /login).
  const toggleFavorite = async () => {
    if (!product) return false;
    if (!auth.isAuthenticated) return false;
    setFavoriteError('');
    setIsTogglingFavorite(true);
    try {
      const authHeader = { Authorization: `Bearer ${auth.token}` };
      const data = isFavorite
        ? await apiFetch(`/api/users/${auth.user._id}/favorites/${product.id}`, {
            method: 'DELETE',
            headers: authHeader,
          })
        : await apiFetch(`/api/users/${auth.user._id}/favorites`, {
            method: 'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: product.id }),
          });
      // La respuesta trae favorites poblado (ver auth.js) — se normaliza a ids.
      const ids = (data.user?.favorites || []).map((f) => (typeof f === 'string' ? f : f._id));
      auth.updateUser({ favorites: ids });
    } catch (err) {
      setFavoriteError(err.message || 'No fue posible actualizar tus favoritos.');
    } finally {
      setIsTogglingFavorite(false);
    }
    return true;
  };

  // Atributos del admin (Product.attributes) para la ficha completa, y los
  // primeros para destacar junto al nombre (el orden del admin decide cuáles).
  const attributes = product?.attributes || [];
  const highlights = attributes.slice(0, HIGHLIGHT_COUNT);

  return {
    product,
    sellable,
    variant,
    unavailable,
    isOptionAvailable,
    catalog,
    isLoading,
    images,
    activeImage,
    setActiveImage,
    optionGroups,
    selectedOptions,
    setOption,
    qty,
    setQty: (n) => setQty(Math.max(1, Math.min(n, remaining))),
    limit,
    remaining,
    addToCart,
    added,
    isFavorite,
    toggleFavorite,
    isTogglingFavorite,
    favoriteError,
    attributes,
    highlights,
  };
};
