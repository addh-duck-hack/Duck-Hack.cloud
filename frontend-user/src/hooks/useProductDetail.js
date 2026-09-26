// src/hooks/useProductDetail.js
//
// Estado de la ficha de producto (/tienda/:id): opciones elegidas, cantidad,
// galería, "agregar a la canasta" y favoritos. Sin UI.
import { useEffect, useState } from 'react';
import { useProduct } from './useProducts';
import { useCart } from './useCart';
import { useAuth } from './useAuth';
import { apiFetch } from '../utils/apiClient';

const ADDED_FEEDBACK_MS = 1600;
const HIGHLIGHT_COUNT = 2;

// Selección por default: el primer valor de cada grupo de opciones del
// producto (ver useProducts.js — options: [{ name, values }]).
const defaultOptionValues = (product) => {
  const defaults = {};
  (product?.options || []).forEach((group) => {
    if (group?.name && group.values?.length) defaults[group.name] = group.values[0];
  });
  return defaults;
};

export const useProductDetail = (id) => {
  const { product, products: catalog, isLoading } = useProduct(id);
  const { addItem } = useCart();
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

  const optionGroups = product?.options || [];
  // Todas las imágenes; si el producto solo trae una miniatura se usa esa.
  const images = product?.images?.length ? product.images : product?.image ? [product.image] : [];

  const setOption = (groupName, value) => {
    setSelectedOptions((prev) => ({ ...prev, [groupName]: value }));
  };

  const addToCart = () => {
    if (!product) return;
    addItem(product, qty, selectedOptions);
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
    catalog,
    isLoading,
    images,
    activeImage,
    setActiveImage,
    optionGroups,
    selectedOptions,
    setOption,
    qty,
    setQty: (n) => setQty(Math.max(1, n)),
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
