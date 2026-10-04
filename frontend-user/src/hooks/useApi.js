// src/hooks/useApi.js — GET simple con estado de carga/error y recarga.
// `path` null = no pedir nada (p. ej. sin sesión). Una respuesta que llega
// después de cambiar de ruta (o de otra petición más nueva) se descarta.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiClient';

export const useApi = (path, headers) => {
  const headerKey = JSON.stringify(headers || {});
  const [state, setState] = useState({ data: null, error: null, isLoading: Boolean(path) });
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestRef.current;
    if (!path) {
      setState({ data: null, error: null, isLoading: false });
      return;
    }
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await apiFetch(path, { headers: JSON.parse(headerKey) });
      if (id === requestRef.current) setState({ data, error: null, isLoading: false });
    } catch (error) {
      if (id === requestRef.current) setState({ data: null, error, isLoading: false });
    }
  }, [path, headerKey]);

  useEffect(() => {
    load();
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  return { ...state, reload: load };
};
