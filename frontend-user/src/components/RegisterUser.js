import React, { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../utils/apiClient";
import "./Auth.css";

const RegisterUser = () => {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
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
      const data = await apiFetch("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      setSuccess(data?.message || "Registro exitoso. Revisa tu correo para verificar tu cuenta.");
    } catch (err) {
      setError(err.message || "No se pudo registrar la cuenta");
    }
  };

  return (
    <section className="auth-page">
      <div className="auth-card">
        <h2>Crear cuenta</h2>
        <p>Regístrate para guardar pedidos y avanzar más rápido en checkout.</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <input
            type="text"
            name="name"
            placeholder="Nombre completo"
            value={form.name}
            onChange={onChange}
            required
          />
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
            minLength={6}
            value={form.password}
            onChange={onChange}
            required
          />
          <button type="submit">Crear cuenta</button>
        </form>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        <div className="auth-link">
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </div>
      </div>
    </section>
  );
};

export default RegisterUser;
