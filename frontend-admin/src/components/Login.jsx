import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Loader from "./Loader"; // Importar el componente Loader
import RegisterUser from "./RegisterUser"; // Reutilizar componente de registro
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { useStoreConfig } from "../hooks/useStoreConfig";
import logo from "../assets/logo.png";

const Login = () => {
  const adminRoles = ["super_admin", "store_admin", "catalog_manager", "order_manager"];
  const [userData, setUserData] = useState({
    email: "",
    password: "",
  });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false); // Estado para mostrar el loader
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Estado para verificar si el usuario ha iniciado sesión
  const [showRegister, setShowRegister] = useState(false); // Mostrar form de registro inline
  const navigate = useNavigate(); // React Router v6

  // El panel es "Duck-Hack OS" (mismo software para todas las tiendas), pero el
  // login debe dejar claro a qué tienda se está entrando. Nombre + tema visual
  // salen de StoreConfig (StoreConfigProvider ya hizo el fetch y aplicó los
  // colores/fuentes); acá solo se usa el nombre para el texto.
  const { config: storeConfig } = useStoreConfig();
  const storeName = storeConfig?.storeName || "";

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
      const response = await axios.post(`${getApiBaseUrl()}/api/users/login`, userData);
      const role = response.data?.user?.role;

      if (!adminRoles.includes(role)) {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        setMessage("Tu cuenta no tiene permisos para ingresar al panel administrativo.");
        setIsLoading(false);
        return;
      }

      // Guardar credenciales de sesión para el panel
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("role", role);

      // Actualizar el estado para indicar que el login fue exitoso
      setMessage("Login exitoso");
      setIsLoggedIn(true); // Cambiar el estado a "logueado"

    } catch (error) {
      const serverMsg = error.response?.data?.error?.message;
      if (serverMsg) {
        setMessage(serverMsg);
      } else {
        setMessage("Error no identificado en el servidor, intenta nuevamente más tarde.");
      }
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
    <section className="auth-page">
      <div className="auth-brand">
        <img src={logo} alt="Duck-Hack OS" />
        <span>Duck-Hack OS</span>
      </div>

      {isLoading ? (
        <Loader /> // Mostrar el loader mientras se está cargando
      ) : (
        <div className="auth-card">
          {!showRegister ? (
            <>
              <h2>Iniciar sesión</h2>
              <p>
                {storeName ? (
                  <>
                    Estás accediendo al panel de administración de{" "}
                    <strong>{storeName}</strong>.
                  </>
                ) : (
                  "Estás accediendo al panel de administración de tu tienda."
                )}
              </p>
              <p className="auth-note">
                Duck-Hack OS — plataforma actualizada por Duck-Hack.
              </p>
              <form className="auth-form" onSubmit={handleSubmit}>
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
                <button type="submit">Iniciar sesión</button>
              </form>

              {message && <div className="auth-error">{message}</div>}

              <div className="auth-link">
                ¿No tienes cuenta?{" "}
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => { setShowRegister(true); setMessage(""); }}
                >
                  Crear cuenta nueva
                </button>
              </div>
            </>
          ) : (
            <RegisterUser onBack={() => setShowRegister(false)} />
          )}
        </div>
      )}
    </section>
  );
};

export default Login;
