// src/hooks/useAuth.jsx
//
// Sesión del cliente en el storefront. Antes cada componente (login,
// checkout, canasta) leía/escribía a mano los mismos localStorage
// keys (duckhack_customer_token/duckhack_customer_user) sin compartir
// estado entre ellos — este contexto es ahora la única fuente de verdad.
// No es "seguridad real": el backend es quien de verdad valida el JWT en
// cada request (ver packages/core-api/lib/authMiddleware.js); esto solo
// evita que la sesión se pierda entre renders y le da a cualquier
// componente (nav, checkout, Mi cuenta) una forma de saber si hay sesión
// sin leer localStorage directo.
import React, { createContext, useCallback, useContext, useState } from 'react';

const TOKEN_KEY = 'duckhack_customer_token';
const USER_KEY = 'duckhack_customer_user';

const AuthContext = createContext(null);

const readStoredToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

const readStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(readStoredToken);
  const [user, setUser] = useState(readStoredUser);

  // Se llama con la respuesta tal cual de POST /api/users/login
  // ({ token, user }) desde useAuthForms.js#useLoginForm (página /login y
  // paso "Tu cuenta" del checkout).
  const login = useCallback(({ token: newToken, user: newUser }) => {
    try {
      if (newToken) localStorage.setItem(TOKEN_KEY, newToken);
      if (newUser) localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    } catch {
      // localStorage bloqueado (modo privado, etc.) — la sesión sigue en
      // memoria mientras dure la pestaña.
    }
    if (newToken) setToken(newToken);
    if (newUser) setUser(newUser);
  }, []);

  // Actualiza solo los datos del usuario (nombre/teléfono/dirección/
  // favoritos) sin tocar el token — usado tras editar el perfil en
  // "Mi cuenta" (useAccount.js), donde PUT /api/users/:id regresa el user
  // actualizado pero no un token nuevo.
  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      const next = { ...(prev || {}), ...patch };
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(next));
      } catch {
        // sin persistencia — sigue en memoria
      }
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // nada que limpiar si localStorage no está disponible
    }
    setToken(null);
    setUser(null);
  }, []);

  const value = {
    token,
    user,
    isAuthenticated: Boolean(token && user),
    login,
    updateUser,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
};

// Header Authorization listo para cualquier fetch autenticado — función
// standalone (no el hook) para poder usarla fuera de un componente de React,
// como useCart.jsx#submitOrder.
export const getAuthHeader = () => {
  const token = readStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
