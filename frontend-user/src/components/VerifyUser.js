import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './VerifyUser.css';

const VerifyUser = () => {
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
      const backend = process.env.REACT_APP_HOST_SERVICES_URL || '';
      const res = await fetch(`${backend}/api/users/verify?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        setStatus('success');
        setMessage(data.message || 'Cuenta verificada correctamente. Ahora puedes iniciar sesión.');
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus('error');
        setMessage(err.message || 'Error verificando el token. Puede estar expirado o ser inválido.');
      }
    } catch (error) {
      console.error('Error verificando usuario:', error);
      setStatus('error');
      setMessage('Error de red al intentar verificar la cuenta. Intenta nuevamente más tarde.');
    }
  };

  return (
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
  );
};

export default VerifyUser;
