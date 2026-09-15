// src/components/CheckoutAccountStep.jsx
//
// Paso "Tu cuenta" del checkout: antes de pedir los datos de envío se le
// ofrece al comprador iniciar sesión, crear una cuenta o seguir como
// invitado. Reutiliza los mismos endpoints que LoginUser.jsx/RegisterUser.jsx
// (POST /api/users/login y /api/users/register) — el pedido en sí siempre se
// manda por POST /api/orders/public (ver useCart.jsx#submitOrder), así que
// iniciar sesión aquí solo precarga nombre/correo/teléfono; no vincula el
// pedido a la cuenta (packages/core-api/modules/orders.js#validateCheckoutExtras
// borra `customer` de cualquier checkout público, con o sin token).
//
// Registrarse tampoco deja loguearse de inmediato (el backend exige verificar
// el correo antes de permitir login, sin atajo), así que después de crear la
// cuenta seguimos la compra actual como invitado con los mismos datos ya
// escritos — la cuenta queda lista para la próxima vez.
import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { useAuth } from '../hooks/useAuth';
import './Auth.css';

const REGISTER_AUTO_CONTINUE_MS = 1600;

const CheckoutAccountStep = ({ onGuest, onContinue, onBack }) => {
  const auth = useAuth();
  const [mode, setMode] = useState('choice'); // 'choice' | 'login' | 'register'
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autoContinueRef = useRef(null);

  useEffect(() => () => clearTimeout(autoContinueRef.current), []);

  const goTo = (nextMode) => {
    setError('');
    setSuccess('');
    setMode(nextMode);
  };

  const handleLoginChange = (e) => {
    const { name, value } = e.target;
    setLoginForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegisterChange = (e) => {
    const { name, value } = e.target;
    setRegisterForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const data = await apiFetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      auth.login(data);
      onContinue({
        customerName: data?.user?.name || '',
        customerEmail: data?.user?.email || loginForm.email,
        customerPhone: data?.user?.phone || '',
        authenticated: true,
        user: data?.user || { email: loginForm.email },
      });
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const payload = { name: registerForm.name, email: registerForm.email, password: registerForm.password };
      if (registerForm.phone) payload.phone = registerForm.phone;

      const data = await apiFetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSuccess(data?.message || 'Cuenta creada. Revisa tu correo para verificarla.');
      autoContinueRef.current = setTimeout(() => {
        onContinue({
          customerName: registerForm.name,
          customerEmail: registerForm.email,
          customerPhone: registerForm.phone,
          authenticated: false,
        });
      }, REGISTER_AUTO_CONTINUE_MS);
    } catch (err) {
      setError(err.message || 'No se pudo crear la cuenta');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueAsGuestNow = () => {
    clearTimeout(autoContinueRef.current);
    onContinue({
      customerName: registerForm.name,
      customerEmail: registerForm.email,
      customerPhone: registerForm.phone,
      authenticated: false,
    });
  };

  if (mode === 'login') {
    return (
      <form className="auth-form checkout-account-form" onSubmit={handleLoginSubmit}>
        <h3>Iniciar sesión</h3>
        <input
          type="email"
          name="email"
          placeholder="Correo electrónico"
          value={loginForm.email}
          onChange={handleLoginChange}
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Contraseña"
          value={loginForm.password}
          onChange={handleLoginChange}
          required
        />
        {error ? <div className="auth-error">{error}</div> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar y continuar'}
        </button>
        <button type="button" className="cart-cont as-btn" onClick={() => goTo('choice')} disabled={isSubmitting}>
          ← Elegir otra opción
        </button>
      </form>
    );
  }

  if (mode === 'register') {
    return (
      <form className="auth-form checkout-account-form" onSubmit={handleRegisterSubmit}>
        <h3>Crear cuenta</h3>
        <input
          type="text"
          name="name"
          placeholder="Nombre completo"
          value={registerForm.name}
          onChange={handleRegisterChange}
          required
        />
        <input
          type="email"
          name="email"
          placeholder="Correo electrónico"
          value={registerForm.email}
          onChange={handleRegisterChange}
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Contraseña"
          minLength={6}
          value={registerForm.password}
          onChange={handleRegisterChange}
          required
        />
        <input
          type="tel"
          name="phone"
          placeholder="Teléfono / WhatsApp (opcional)"
          value={registerForm.phone}
          onChange={handleRegisterChange}
        />
        {error ? <div className="auth-error">{error}</div> : null}
        {success ? (
          <div className="auth-success">
            {success}
            <div className="checkout-account-success-actions">
              <button type="button" onClick={handleContinueAsGuestNow}>Continuar con mi compra →</button>
            </div>
          </div>
        ) : (
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creando…' : 'Crear cuenta y continuar'}
          </button>
        )}
        {!success && (
          <button type="button" className="cart-cont as-btn" onClick={() => goTo('choice')} disabled={isSubmitting}>
            ← Elegir otra opción
          </button>
        )}
      </form>
    );
  }

  return (
    <div className="account-choice">
      <p className="account-choice-lead">¿Cómo quieres continuar con tu compra?</p>
      <button type="button" className="account-choice-card" onClick={() => goTo('login')}>
        <strong>Iniciar sesión</strong>
        <span>Ya tengo cuenta — usar mis datos guardados.</span>
      </button>
      <button type="button" className="account-choice-card" onClick={() => goTo('register')}>
        <strong>Crear cuenta</strong>
        <span>Para guardar mis datos y avanzar más rápido la próxima vez.</span>
      </button>
      <button type="button" className="account-choice-card account-choice-guest" onClick={onGuest}>
        <strong>Continuar como invitado</strong>
        <span>Sin registrarme, solo con mis datos de envío.</span>
      </button>
      <button type="button" className="cart-cont as-btn" onClick={onBack}>
        ← Volver a la canasta
      </button>
    </div>
  );
};

export default CheckoutAccountStep;
