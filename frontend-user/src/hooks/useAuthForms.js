// src/hooks/useAuthForms.js
//
// Lógica de los formularios de sesión, sin UI: login, registro, recuperar
// contraseña y verificación de correo. Los usan las páginas /login,
// /register, /recuperar-contrasena y /users/verify, y el paso "Tus datos" del
// checkout (useCheckout.js).
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { useAuth } from './useAuth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6; // mismo mínimo que modules/auth.js

// Destino después de iniciar sesión (?next=). Solo rutas internas ("/algo",
// no "//otro-sitio" ni URLs completas), para no abrir una redirección a
// cualquier dominio.
export const safeNextPath = (value, fallback = '/mi-cuenta') =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback;

// POST /api/users/login. En éxito guarda la sesión en AuthProvider y llama
// onSuccess(data) con la respuesta completa ({ token, user }). `errorCode`
// es el code del backend (p. ej. ACCOUNT_NOT_VERIFIED, para ofrecer
// reenviar el correo de verificación).
export const useLoginForm = ({ onSuccess } = {}) => {
  const auth = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    setErrorCode('');
    setIsSubmitting(true);
    try {
      const data = await apiFetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      auth.login(data);
      onSuccess?.(data, form);
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión');
      setErrorCode(err.code || '');
    } finally {
      setIsSubmitting(false);
    }
  };

  return { form, onChange, onSubmit, error, errorCode, isSubmitting };
};

// POST /api/users/register. El backend siempre fuerza role: customer y exige
// verificar el correo antes de permitir login, así que registrarse NO deja
// sesión iniciada — solo un mensaje de éxito. Con `confirmPassword: true`
// (página /register) el formulario pide la contraseña dos veces y valida que
// coincidan antes de enviar; el teléfono, si se escribe, debe tener 10 dígitos.
export const useRegisterForm = ({ onSuccess, confirmPassword = false } = {}) => {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', phone: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    setSuccess('');
    const phoneDigits = form.phone.replace(/\D/g, '');
    if (form.password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (confirmPassword && form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (form.phone && phoneDigits.length !== 10) {
      setError('El teléfono debe tener 10 dígitos.');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = { name: form.name, email: form.email, password: form.password };
      if (phoneDigits) payload.phone = phoneDigits;
      const data = await apiFetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSuccess(data?.message || 'Registro exitoso. Revisa tu correo para verificar tu cuenta.');
      onSuccess?.(data, form);
    } catch (err) {
      setError(err.message || 'No se pudo registrar la cuenta');
    } finally {
      setIsSubmitting(false);
    }
  };

  return { form, onChange, onSubmit, error, success, isSubmitting };
};

// Recuperar contraseña: POST /api/users/forgot-password { email }. El éxito
// es un mensaje genérico ("si hay una cuenta con ese correo…") para no
// revelar qué correos están registrados. Un 404 (backend sin el endpoint,
// p. ej. una tienda que aún no recibe el merge de main) se muestra como
// `unavailable` en vez de fingir que se mandó un correo.
export const useForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | unavailable | error
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Escribe un correo válido.');
      return;
    }
    setStatus('sending');
    try {
      await apiFetch('/api/users/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setStatus('sent');
    } catch (err) {
      if (err.status === 404) {
        setStatus('unavailable');
        return;
      }
      setStatus('error');
      setError(err.message || 'No pudimos procesar tu solicitud. Intenta más tarde.');
    }
  };

  return { email, setEmail, status, error, onSubmit, reset: () => setStatus('idle') };
};

// Reenviar el correo de verificación: POST /api/users/resend-verification.
// Respuesta genérica del backend; `sent` activa el aviso "te enviamos un
// nuevo enlace".
export const useResendVerification = () => {
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  const resend = async (email) => {
    setError('');
    if (!EMAIL_REGEX.test(String(email || '').trim())) {
      setStatus('error');
      setError('Escribe un correo válido.');
      return;
    }
    setStatus('sending');
    try {
      await apiFetch('/api/users/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(email).trim() }),
      });
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'No pudimos reenviar el correo. Intenta más tarde.');
    }
  };

  return { status, error, resend };
};

// Restablecer la contraseña con el token del enlace del correo
// (/restablecer-contrasena?token=): POST /api/users/reset-password. El token
// sirve una sola vez y vence (1 h); si falla, `invalidToken` ofrece pedir
// otro enlace.
export const useResetPassword = (search) => {
  const token = new URLSearchParams(search).get('token') || '';
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [error, setError] = useState('');
  const [invalidToken, setInvalidToken] = useState(!token);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    if (form.password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setStatus('sending');
    try {
      await apiFetch('/api/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: form.password }),
      });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      if (err.code === 'RESET_TOKEN_INVALID_OR_EXPIRED' || err.code === 'RESET_TOKEN_REQUIRED') setInvalidToken(true);
      else setError(err.message || 'No pudimos actualizar tu contraseña. Intenta más tarde.');
    }
  };

  return { form, onChange, onSubmit, status, error, invalidToken };
};

// GET /api/users/verify?token=... — el token llega en la query string del
// enlace del correo (`search` es location.search). Verifica sola al montar,
// una vez (ref: StrictMode monta dos veces en desarrollo). Un token vencido o
// inválido deja status 'error' y la página ofrece reenviar el correo.
export const useVerifyEmail = (search) => {
  const token = new URLSearchParams(search).get('token') || '';
  const [status, setStatus] = useState(token ? 'loading' : 'error'); // loading | success | error
  const [message, setMessage] = useState(token ? '' : 'El enlace no tiene un token de verificación.');
  const startedRef = useRef('');

  useEffect(() => {
    if (!token || startedRef.current === token) return;
    startedRef.current = token;
    apiFetch(`/api/users/verify?token=${encodeURIComponent(token)}`)
      .then((data) => {
        setStatus('success');
        setMessage(data?.message || 'Tu cuenta está verificada.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'No pudimos verificar tu cuenta.');
      });
  }, [token]);

  return { token, status, message };
};
