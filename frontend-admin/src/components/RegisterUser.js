import React, { useState, useEffect } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

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
      const { name, email, password } = userData;
      const payload = { name, email, password };
      const response = await axios.post(`${getApiBaseUrl()}/api/users/register`, payload);
      setMessage(response.data.message || "Usuario registrado correctamente");
      setUserData({ name: "", email: "", password: "", confirmPassword: "" });
    } catch (error) {
      // Mostrar el mensaje del servidor como error si existe
      const serverMsg = error.response?.data?.error?.message;
      if (serverMsg) {
        setError(serverMsg);
      } else {
        setError("Error al registrar el usuario");
      }
      setMessage("");
    }
  };

  return (
    <>
      <h2>Registrar usuario</h2>
      <p>Crea una cuenta nueva (rol customer).</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          type="text"
          name="name"
          placeholder="Nombre"
          aria-label="Nombre"
          value={userData.name}
          onChange={handleChange}
          required
        />
        <input
          type="email"
          name="email"
          placeholder="Correo electrónico"
          aria-label="Correo electrónico"
          value={userData.email}
          onChange={handleChange}
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Contraseña"
          aria-label="Contraseña"
          value={userData.password}
          onChange={handleChange}
          required
        />
        <input
          type="password"
          name="confirmPassword"
          placeholder="Confirmar contraseña"
          aria-label="Confirmar contraseña"
          value={userData.confirmPassword}
          onChange={handleChange}
          required
        />
        {/* El rol se asigna por defecto en backend como 'customer' */}
        <button type="submit" disabled={userData.password !== userData.confirmPassword}>Registrar</button>
      </form>

      {error && <div className="auth-error">{error}</div>}
      {message && <div className="auth-success">{message}</div>}

      <div className="auth-link">
        ¿Ya tienes una cuenta?{" "}
        <button type="button" className="auth-link-btn" onClick={onBack}>Iniciar sesión</button>
      </div>
    </>
  );
};

export default RegisterUser;
