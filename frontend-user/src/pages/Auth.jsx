// src/pages/Auth.jsx — iniciar sesión, crear cuenta, verificar correo
// (/users/verify?token=, enlace del correo) y recuperar contraseña
// (/restablecer-contrasena?token=). Rutas de /api/users.
import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Loading, Notice } from '../ui/bits';
import { apiFetch } from '../utils/apiClient';
import { errorText } from '../utils/format';

const post = (path, body) =>
  apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Solo rutas internas para volver después de entrar.
const safeBack = (value) => (value && value.startsWith('/') && !value.startsWith('//') ? value : '/cuenta');

const AuthCard = ({ title, children }) => (
  <div className="wrap auth">
    <section className="card">
      <h1>{title}</h1>
      {children}
    </section>
  </div>
);

export const Login = () => {
  const { login, isAuthenticated, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const back = safeBack(params.get('volver'));
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) return <Navigate to={back} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setUnverified(false);
    try {
      const data = await post('/api/users/login', { email: form.email.trim(), password: form.password });
      if (data.user?.role !== 'customer') {
        setError('Esta cuenta es del equipo; entra desde el panel de administración.');
        return;
      }
      login(data);
      navigate(back, { replace: true });
    } catch (err) {
      setUnverified(err.code === 'ACCOUNT_NOT_VERIFIED');
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      const data = await post('/api/users/resend-verification', { email: form.email.trim() });
      setInfo(data.message || 'Te reenviamos el correo de verificación.');
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <AuthCard title="Iniciar sesión">
      {sessionExpired ? <Notice>Tu sesión venció, vuelve a entrar.</Notice> : null}
      <form className="stack" onSubmit={submit}>
        <label>Correo<input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Contraseña<input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <Notice type="error">{error}</Notice>
        {unverified ? <button type="button" className="link-btn" onClick={resend}>Reenviar correo de verificación</button> : null}
        <Notice type="success">{info}</Notice>
        <button className="btn btn--block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
      <p className="auth__links">
        <Link to="/olvide-contrasena">¿Olvidaste tu contraseña?</Link>
        <Link to={`/registro${params.get('volver') ? `?volver=${encodeURIComponent(params.get('volver'))}` : ''}`}>Crear cuenta</Link>
      </p>
    </AuthCard>
  );
};

export const Register = () => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const onField = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await post('/api/users/register', { ...form, name: form.name.trim(), email: form.email.trim(), phone: form.phone || undefined });
      setDone(data.message || 'Te mandamos un correo para verificar tu cuenta.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthCard title="Revisa tu correo">
        <Notice type="success">{done}</Notice>
        <p className="muted">Abre el enlace del correo para activar tu cuenta y después inicia sesión.</p>
        <Link className="btn" to="/login">Ir a iniciar sesión</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Crear cuenta">
      <p className="muted small">Con tu cuenta ves tus citas y pedidos, guardas favoritos y juntas puntos y sellos.</p>
      <form className="stack" onSubmit={submit}>
        <label>Nombre<input name="name" autoComplete="name" value={form.name} onChange={onField} required /></label>
        <label>Correo<input name="email" type="email" autoComplete="email" value={form.email} onChange={onField} required /></label>
        <label>Teléfono (opcional)<input name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={onField} /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="new-password" minLength={6} value={form.password} onChange={onField} required /></label>
        <Notice type="error">{error}</Notice>
        <button className="btn btn--block" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</button>
      </form>
      <p className="auth__links"><Link to="/login">Ya tengo cuenta</Link></p>
    </AuthCard>
  );
};

export const VerifyEmail = () => {
  const [params] = useSearchParams();
  const [state, setState] = useState({ busy: true, ok: '', error: '' });
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get('token');
    if (!token) {
      setState({ busy: false, ok: '', error: 'Falta el enlace de verificación.' });
      return;
    }
    apiFetch(`/api/users/verify?token=${encodeURIComponent(token)}`)
      .then((data) => setState({ busy: false, ok: data.message || 'Cuenta verificada.', error: '' }))
      .catch((err) => setState({ busy: false, ok: '', error: errorText(err) }));
  }, [params]);
  return (
    <AuthCard title="Verificar correo">
      {state.busy ? <Loading text="Verificando…" /> : null}
      <Notice type="success">{state.ok}</Notice>
      <Notice type="error">{state.error}</Notice>
      {!state.busy ? <Link className="btn" to="/login">Iniciar sesión</Link> : null}
    </AuthCard>
  );
};

export const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await post('/api/users/forgot-password', { email: email.trim() });
      setMsg(data.message);
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <AuthCard title="Recuperar contraseña">
      <form className="stack" onSubmit={submit}>
        <label>Correo de tu cuenta<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <Notice type="success">{msg}</Notice>
        <Notice type="error">{error}</Notice>
        <button className="btn btn--block">Enviar enlace</button>
      </form>
    </AuthCard>
  );
};

export const ResetPassword = () => {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await post('/api/users/reset-password', { token: params.get('token'), password });
      setMsg(data.message || 'Listo, ya puedes iniciar sesión.');
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <AuthCard title="Nueva contraseña">
      {msg ? (
        <>
          <Notice type="success">{msg}</Notice>
          <Link className="btn" to="/login">Iniciar sesión</Link>
        </>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label>Nueva contraseña<input type="password" minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <Notice type="error">{error}</Notice>
          <button className="btn btn--block">Guardar</button>
        </form>
      )}
    </AuthCard>
  );
};
