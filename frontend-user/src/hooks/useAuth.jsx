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
//
// La sesión se cierra sola cuando el token ya no sirve: al cargar si ya
// venció (fecha `exp` del JWT), justo al vencer (temporizador) y cuando el
// backend responde que el token no es válido (evento `auth:expired` de
// utils/apiClient.js). En ese caso `sessionExpired` queda en true para que el
// login lo avise; la canasta NO se vacía (ver useCart.jsx).
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { SESSION_EXPIRED_EVENT } from '../utils/apiClient';

const TOKEN_KEY = 'duckhack_customer_token';
const USER_KEY = 'duckhack_customer_user';

const AuthContext = createContext(null);

// Vencimiento del JWT (ms) leyendo su `exp`, sin verificar la firma (eso lo
// hace el backend). null si no se puede leer.
const tokenExpiresAt = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Number(payload.exp) > 0 ? Number(payload.exp) * 1000 : null;
  } catch {
    return null;
  }
};
// setTimeout no acepta más de ~24.8 días.
const MAX_TIMER_MS = 2 ** 31 - 1;

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
  const [sessionExpired, setSessionExpired] = useState(false);

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
    setSessionExpired(false);
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

  // Cierre por sesión vencida o inválida (no por el usuario).
  const expireSession = useCallback(() => {
    logout();
    setSessionExpired(true);
  }, [logout]);

  // El backend dijo que el token ya no sirve.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onExpired = () => {
      if (readStoredToken()) expireSession();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [expireSession]);

  // Vencido al cargar, o cerrar justo cuando venza.
  useEffect(() => {
    if (!token) return undefined;
    const expiresAt = tokenExpiresAt(token);
    if (!expiresAt) return undefined;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      expireSession();
      return undefined;
    }
    const timer = setTimeout(expireSession, Math.min(remaining, MAX_TIMER_MS));
    return () => clearTimeout(timer);
  }, [token, expireSession]);

  const value = {
    token,
    user,
    isAuthenticated: Boolean(token && user),
    sessionExpired,
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
