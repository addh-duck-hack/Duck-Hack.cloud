import React, { useState, useEffect } from "react";
import axios from "axios";
import { Link } from "react-router-dom";

const RegisterUser = ({ onBack }) => {
  const [userData, setUserData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData({
      ...userData,
      [name]: value,
    });
    // limpiar errores cuando el usuario escribe
    setError("");
  };

  // Validación en tiempo real para mostrar errores cuando las contraseñas no coinciden
  useEffect(() => {
    // Priorizar longitud mínima
    if (userData.password && userData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    // Si ambos campos están presentes y no coinciden, mostrar error
    if (userData.confirmPassword && userData.password !== userData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    // Si todo está bien, limpiar el error
    setError('');
  }, [userData.password, userData.confirmPassword]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validaciones en cliente
    if (!userData.password || userData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (userData.password !== userData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    try {
      // Forzar role por defecto en el payload
      const { name, email, password } = userData;
      const payload = { name, email, password, role: 'user' };
      const response = await axios.post(`${process.env.REACT_APP_HOST_SERVICES_URL}/api/users/register`, payload);
      setMessage(response.data.message || "Usuario registrado correctamente");
      setUserData({ name: "", email: "", password: "", confirmPassword: "" });
    } catch (error) {
      // Mostrar el mensaje del servidor como error si existe
      const serverMsg = error.response?.message || error.response?.error;
      if (serverMsg) {
        setError(serverMsg);
      } else {
        setError("Error al registrar el usuario");
      }
      setMessage("");
    }
  };

  return (
    <div>
      <h2>Registrar Usuario</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name">Nombre:</label>
          <input
            type="text"
            id="name"
            name="name"
            value={userData.name}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label htmlFor="email">Correo Electrónico:</label>
          <input
            type="email"
            id="email"
            name="email"
            value={userData.email}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Contraseña:</label>
          <input
            type="password"
            id="password"
            name="password"
            value={userData.password}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label htmlFor="confirmPassword">Confirmar contraseña:</label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={userData.confirmPassword}
            onChange={handleChange}
            required
          />
        </div>
        {/* El rol se asigna por defecto como 'user' */}
        <button type="submit" disabled={userData.password !== userData.confirmPassword}>Registrar</button>
        <div>
          <p>¿Ya tienes una cuenta?</p>
          <button type="button" onClick={onBack}>Iniciar sesión</button>
        </div>
      </form>
      {error && <p style={{ color: 'var(--ColorResalte)' }}>{error}</p>}
      {message && <p>{message}</p>}
    </div>
  );
};

export default RegisterUser;
