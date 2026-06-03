import React, { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../utils/apiClient";
import "./Auth.css";

const LoginUser = () => {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const onChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const data = await apiFetch("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (data?.token) {
        localStorage.setItem("duckhack_customer_token", data.token);
      }
      if (data?.user) {
        localStorage.setItem("duckhack_customer_user", JSON.stringify(data.user));
      }

      setSuccess("Inicio de sesión exitoso.");
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión");
    }
  };

  return (
    <section className="auth-page">
      <div className="auth-card">
        <h2>Iniciar sesión</h2>
        <p>Accede a tu cuenta para continuar con tu compra.</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <input
            type="email"
            name="email"
            placeholder="Correo electrónico"
            value={form.email}
            onChange={onChange}
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Contraseña"
            value={form.password}
            onChange={onChange}
            required
          />
          <button type="submit">Entrar</button>
        </form>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        <div className="auth-link">
          ¿Aún no tienes cuenta? <Link to="/register">Regístrate aquí</Link>
        </div>
      </div>
    </section>
  );
};

export default LoginUser;
