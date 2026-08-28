import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiFetch } from '../utils/apiClient';
import logo from '../assets/logo.png';
import { useStoreConfig, resolveStoreImageUrl } from '../hooks/useStoreConfig';
import './VerifyUser.css';

const VerifyUser = () => {
  const { config } = useStoreConfig();
  const logoSrc = resolveStoreImageUrl(config?.logoUrl) || logo;
  const brandName = config?.storeName || 'Duck-Hack';
  const location = useLocation();
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Extraer token de la query string
    const params = new URLSearchParams(location.search);
    const t = params.get('token') || '';
    setToken(t);
  }, [location.search]);

  const handleVerify = async () => {
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
    } catch (error) {
      console.error('Error verificando usuario:', error);
      setStatus('error');
      setMessage('Error de red al intentar verificar la cuenta. Intenta nuevamente más tarde.');
    }
  };

  return (
    <div className="verify-page">
      <Link to="/" className="auth-brand">
        <img src={logoSrc} alt={brandName} />
        <span>{brandName}</span>
      </Link>
      <div className="verify-container">
        <h2>Verificar correo</h2>
      <p>
        Gracias por registrarte. Para activar tu cuenta debes verificar tu correo electrónico.
        Haz clic en el botón de abajo para completar la verificación.
      </p>

      {!token && (
        <div className="notice">
          <p>No se encontró un token en la URL. Si seguiste un enlace por correo, revisa que la dirección sea correcta.</p>
        </div>
      )}

      <div className="actions">
        <button onClick={handleVerify} disabled={status === 'loading' || !token} className="verify-btn">
          {status === 'loading' ? 'Verificando...' : 'Verificar mi cuenta'}
        </button>
      </div>

        {message && (
          <div className={`result ${status}`}>
            <p>{message}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyUser;
