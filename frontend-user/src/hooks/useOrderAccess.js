// src/hooks/useOrderAccess.js
//
// Acceso del cliente a SU pedido para pagar por transferencia: ver el pedido
// (GET /api/orders/:id/summary), subir el comprobante (POST
// /api/orders/:id/payment-proof) y descargar el ticket (GET
// /api/orders/:id/pdf). Sin UI. Lo usan la página /pedido/:id (enlace del
// correo de confirmación, sirve sin cuenta) y "Mis pedidos".
//
// Dos formas de autenticarse, según quién llega:
//   - Invitado: el token del pedido (`orderAccessToken`, del correo o del
//     checkout) en el header X-Order-Token. Solo sirve para ese pedido.
//   - Con sesión: el Bearer de siempre (el backend revisa que sea su pedido).
//
// El token llega en la URL del correo (?token=…). Se guarda en
// sessionStorage y se quita de la barra de direcciones en cuanto se lee, para
// que no quede en el historial ni se filtre al compartir la pantalla o el
// enlace.
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getApiBaseUrl } from '../utils/apiClient';
import { getAuthHeader } from './useAuth';

const tokenKey = (orderId) => `tacita.order-token.${orderId}`;

// Sin respuesta del backend (red caída, CORS, servidor apagado) fetch lanza
// un TypeError sin `status` ("Failed to fetch"): se cambia por un mensaje
// que el cliente entienda. Los errores con respuesta traen el mensaje del
// backend y se dejan tal cual.
const NETWORK_ERROR = 'No pudimos conectar con la tienda. Revisa tu conexión e intenta de nuevo en unos minutos.';
const friendlyError = (err, fallback) => (err?.status ? err.message || fallback : err instanceof TypeError ? NETWORK_ERROR : err?.message || fallback);

export const rememberOrderToken = (orderId, token) => {
  if (!orderId || !token) return;
  try {
    sessionStorage.setItem(tokenKey(orderId), token);
  } catch {
    // Modo privado / almacenamiento bloqueado: el token sigue en memoria.
  }
};

export const readOrderToken = (orderId) => {
  try {
    return sessionStorage.getItem(tokenKey(orderId)) || '';
  } catch {
    return '';
  }
};

const forgetOrderToken = (orderId) => {
  try {
    sessionStorage.removeItem(tokenKey(orderId));
  } catch {
    // nada que hacer
  }
};

// Mismos límites que el backend (packages/core-api/lib/uploads.js
// #createPaymentProofUploadMiddlewares): aquí solo para avisar antes de
// subir; el backend vuelve a revisar el contenido real del archivo.
export const PROOF_ACCEPT = 'image/jpeg,image/png,application/pdf';
const PROOF_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const PROOF_MAX_MB = 8;

export const validateProofFile = (file) => {
  if (!file) return 'Elige la foto o el PDF de tu comprobante.';
  if (file.type && !PROOF_TYPES.includes(file.type)) return 'El comprobante debe ser una foto (JPG o PNG) o un PDF.';
  if (file.size > PROOF_MAX_MB * 1024 * 1024) return `El archivo pesa más de ${PROOF_MAX_MB} MB.`;
  return '';
};

// Subir el comprobante de un pedido. `getHeaders` da el header de acceso
// (X-Order-Token o Bearer); `onUploaded` recibe la respuesta del backend.
export const usePaymentProofUpload = ({ orderId, getHeaders, onUploaded }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const upload = useCallback(
    async (file) => {
      setError('');
      setSuccess('');
      const invalid = validateProofFile(file);
      if (invalid) {
        setError(invalid);
        return false;
      }
      setIsUploading(true);
      try {
        const body = new FormData();
        body.append('file', file);
        // Sin Content-Type a mano: el navegador pone el boundary del multipart.
        const data = await apiFetch(`/api/orders/${orderId}/payment-proof`, { method: 'POST', headers: getHeaders(), body });
        setSuccess(data?.message || 'Recibimos tu comprobante. Lo revisaremos pronto.');
        await onUploaded?.(data);
        return true;
      } catch (err) {
        setError(friendlyError(err, 'No fue posible subir tu comprobante. Intenta de nuevo.'));
        return false;
      } finally {
        setIsUploading(false);
      }
    },
    [orderId, getHeaders, onUploaded]
  );

  return { upload, isUploading, error, success };
};

// El ticket exige autenticación, así que no puede ser un <a href>: se trae
// como blob y se abre en una pestaña nueva.
export const useTicketDownload = ({ getHeaders }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');

  const download = useCallback(
    async (orderId) => {
      setError('');
      setIsDownloading(true);
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/orders/${orderId}/pdf`, { headers: getHeaders() });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error?.message || 'No fue posible descargar tu ticket.');
        }
        const blob = await response.blob();
        window.open(window.URL.createObjectURL(blob), '_blank');
      } catch (err) {
        setError(friendlyError(err, 'No fue posible descargar tu ticket.'));
      } finally {
        setIsDownloading(false);
      }
    },
    [getHeaders]
  );

  return { download, isDownloading, error };
};

// Página /pedido/:id. `error` trae además `expired` cuando el enlace ya no
// sirve (token vencido, de otro pedido o sin acceso), para ofrecer otra
// salida en vez de un error genérico.
export const useOrderPage = (orderId) => {
  // Token: el de la URL (y se guarda) o el que ya se había guardado.
  const [token] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('token') || '';
    if (fromUrl) rememberOrderToken(orderId, fromUrl);
    return fromUrl || readOrderToken(orderId);
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('token')) {
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const getHeaders = useCallback(() => (token ? { 'X-Order-Token': token } : getAuthHeader()), [token]);

  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null); // { message, expired }

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch(`/api/orders/${orderId}/summary`, { headers: getHeaders() });
      setSummary(data);
    } catch (err) {
      const expired = [401, 403].includes(err.status);
      if (expired && token) forgetOrderToken(orderId);
      setError({
        message: expired
          ? 'Este enlace ya no es válido o venció. Si tienes cuenta, inicia sesión para ver tu pedido en "Mis pedidos".'
          : err.status === 404
            ? 'No encontramos este pedido.'
            : friendlyError(err, 'No fue posible cargar tu pedido.'),
        expired,
      });
    } finally {
      setIsLoading(false);
    }
  }, [orderId, getHeaders, token]);

  useEffect(() => {
    load();
  }, [load]);

  const proof = usePaymentProofUpload({ orderId, getHeaders, onUploaded: load });
  const ticket = useTicketDownload({ getHeaders });

  return { summary, isLoading, error, reload: load, proof, ticket, hasToken: Boolean(token) };
};
