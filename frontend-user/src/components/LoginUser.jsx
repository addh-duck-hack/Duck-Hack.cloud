import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/apiClient";
import { useAuth } from "../hooks/useAuth";
import "./Auth.css";

const LoginUser = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const data = await apiFetch("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      auth.login(data);
      navigate("/mi-cuenta");
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión");
    } finally {
      setIsSubmitting(false);
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
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Entrando…" : "Entrar"}
          </button>
        </form>

        {error && <div className="auth-error">{error}</div>}

        <div className="auth-link">
          ¿Aún no tienes cuenta? <Link to="/register">Regístrate aquí</Link>
        </div>
      </div>
    </section>
  );
};

export default LoginUser;
