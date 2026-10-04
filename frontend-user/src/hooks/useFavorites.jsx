// src/hooks/useFavorites.jsx
//
// Favoritos de la clienta (User.favorites, POST/DELETE /api/users/:id/favorites).
// Además de la lista en "Mi cuenta", son la base del aviso "volvió a estar
// disponible" (módulo wishlist): si un favorito se agota y regresa, le llega
// un correo — salvo que lo apague en Mi cuenta > Mis datos.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { useAuth } from './useAuth';

const FavoritesContext = createContext(null);

export const FavoritesProvider = ({ children }) => {
  const { isAuthenticated, user, token } = useAuth();
  const userId = isAuthenticated ? user?._id : null;
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const apply = (freshUser) => setItems((freshUser?.favorites || []).filter((p) => p && typeof p === 'object'));

  const reload = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    try {
      apply(await apiFetch(`/api/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } }));
    } catch {
      // se queda la lista anterior
    }
  }, [userId, token]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggle = useCallback(
    async (productId) => {
      if (!userId) return false;
      setError('');
      const isFav = items.some((p) => String(p._id) === String(productId));
      try {
        const data = await apiFetch(
          isFav ? `/api/users/${userId}/favorites/${productId}` : `/api/users/${userId}/favorites`,
          {
            method: isFav ? 'DELETE' : 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            ...(isFav ? {} : { body: JSON.stringify({ productId }) }),
          }
        );
        apply(data.user);
        return true;
      } catch (err) {
        setError(err.message);
        return false;
      }
    },
    [items, userId, token]
  );

  const isFavorite = useCallback((productId) => items.some((p) => String(p._id) === String(productId)), [items]);

  return (
    <FavoritesContext.Provider value={{ items, toggle, isFavorite, reload, error, enabled: Boolean(userId) }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => useContext(FavoritesContext);
