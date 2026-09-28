// src/hooks/useAuthForms.js
//
// Lógica de los formularios de sesión, sin UI: login, registro, recuperar
// contraseña y verificación de correo. Los usan las páginas /login,
// /register, /recuperar-contrasena y /users/verify, y el paso "Tus datos" del
// checkout (useCheckout.js).
import { useEffect, useState } from 'react';
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
// onSuccess(data) con la respuesta completa ({ token, user }).
export const useLoginForm = ({ onSuccess } = {}) => {
  const auth = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e) => {
    e?.preventDefault();
    setError('');
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
    } finally {
      setIsSubmitting(false);
    }
  };

  return { form, onChange, onSubmit, error, isSubmitting };
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

// Recuperar contraseña: POST /api/users/forgot-password { email }. El
// endpoint TODAVÍA NO EXISTE en packages/core-api/modules/auth.js (se
// construirá después); mientras tanto responde 404 y la UI lo dice con
// honestidad (`unavailable`) en vez de fingir que se mandó un correo. Cuando
// exista, el éxito es un mensaje genérico ("si hay una cuenta con ese
// correo…") para no revelar qué correos están registrados.
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

// GET /api/users/verify?token=... — el token llega en la query string del
// enlace que manda el correo. `search` es location.search.
export const useVerifyEmail = (search) => {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    setToken(new URLSearchParams(search).get('token') || '');
  }, [search]);

  const verify = async () => {
    if (!token) {
      setMessage('No se encontró un token de verificación en la URL.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setMessage('Verificando tu cuenta...');
    try {
      const data = await apiFetch(`/api/users/verify?token=${encodeURIComponent(token)}`);
      setStatus('success');
      setMessage(data.message || 'Cuenta verificada correctamente. Ahora puedes iniciar sesión.');
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Error de red al intentar verificar la cuenta. Intenta nuevamente más tarde.');
    }
  };

  return { token, status, message, verify };
};
