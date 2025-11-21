import React, { useState, useEffect } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import Loader from "./Loader"; // Importar el componente Loader
import RegisterUser from "./RegisterUser"; // Reutilizar componente de registro

const Login = () => {
  const [userData, setUserData] = useState({
    email: "",
    password: "",
  });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false); // Estado para mostrar el loader
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Estado para verificar si el usuario ha iniciado sesión
  const [showRegister, setShowRegister] = useState(false); // Mostrar form de registro inline
  const navigate = useNavigate(); // React Router v6

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData({
      ...userData,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setIsLoading(true); // Mostrar el loader después de hacer clic en "Iniciar Sesión"
      const response = await axios.post(`${process.env.REACT_APP_HOST_SERVICES_URL}/api/users/login`, userData);
      
      // Guardar el token en localStorage
      localStorage.setItem("token", response.data.token);

      // Actualizar el estado para indicar que el login fue exitoso
      setMessage("Login exitoso");
      setIsLoggedIn(true); // Cambiar el estado a "logueado"
      
    } catch (error) {
      setMessage("Error al iniciar sesión. Verifica tus credenciales.");
      setIsLoading(false); // Dejar de mostrar el loader si hay un error
    }
  };

  // useEffect para simular un retraso de 2 segundos antes de redirigir
  useEffect(() => {
    if (isLoggedIn) {
      // Agregar un retraso de 2 segundos antes de redirigir
      const timer = setTimeout(() => {
        setIsLoading(false); // Ocultar el loader
        window.location.reload(); // Redirigir al menú de administrador
      }, 2000); // 2 segundos de retraso

      // Limpiar el temporizador cuando el componente se desmonte
      return () => clearTimeout(timer);
    }
  }, [isLoggedIn, navigate]);

  return (
    <div>
      <h2>Iniciar Sesión</h2>
      {isLoading ? (
        <Loader /> // Mostrar el loader mientras se está cargando
      ) : (
        <>
        {!showRegister ? (
          <form onSubmit={handleSubmit}>
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
          <button type="submit">Iniciar Sesión</button>
          <div style={{ marginTop: '1rem' }}>
            <button type="button" onClick={() => setShowRegister(true)}>Crear cuenta nueva</button>
          </div>
          </form>
        ) : (
          <div>
            <h3>Crear cuenta</h3>
            <RegisterUser />
            <div style={{ marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setShowRegister(false)}>Volver al login</button>
            </div>
          </div>
        )}
        </>
      )}
      {message && <p>{message}</p>}
      {/*<p>
        ¿No tienes una cuenta? <Link to="/register">Crear cuenta nueva</Link>
      </p>*/}
    </div>
  );
};

export default Login;
