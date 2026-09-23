// src/hooks/useAuthForms.js
//
// Lógica de los formularios de sesión, sin UI: login, registro y
// verificación de correo. Los usan tanto las páginas /login, /register y
// /users/verify como el paso "Tu cuenta" del checkout (useCheckout.js).
import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { useAuth } from './useAuth';

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
// sesión iniciada — solo un mensaje de éxito.
export const useRegisterForm = ({ onSuccess } = {}) => {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
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
    setIsSubmitting(true);
    try {
      const payload = { name: form.name, email: form.email, password: form.password };
      if (form.phone) payload.phone = form.phone;
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
