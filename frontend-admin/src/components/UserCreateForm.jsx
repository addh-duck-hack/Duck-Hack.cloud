// src/components/UserCreateForm.jsx — alta de cuentas de staff desde el
// panel. Pega a POST /api/users (staff-only, distinto de
// POST /api/users/register que es autoservicio y siempre crea role:
// customer, ver packages/core-api/modules/auth.js). Mismo patrón de
// create-vs-edit separados que InvoiceForm.jsx/InvoiceEditForm.jsx — aquí no
// aplica, por ejemplo, ni la contraseña (solo se pide al crear) ni las
// restricciones de "no te edites/borres a ti mismo" de UserForm.jsx.
import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { ROLES, ROLE_LABELS } from "../utils/roles";

const INITIAL_FORM = { name: "", email: "", password: "", phone: "", role: ROLES.COLLABORATOR };

const UserCreateForm = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
  const actorRole = localStorage.getItem("role");

  // store_admin no puede darle de alta a nadie con role super_admin — mismo
  // límite que ya aplica el backend en POST /api/users.
  const assignableRoles = Object.values(ROLES).filter(
    (r) => r !== ROLES.SUPER_ADMIN || actorRole === ROLES.SUPER_ADMIN
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      await axios.post(`${baseUrl}/api/users`, form, {
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      });
      navigate("/admin/users");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible crear el usuario.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section>
      <h3>Nuevo usuario</h3>
      <p>
        Crea una cuenta de staff con la contraseña que le vas a entregar — queda verificada de inmediato, sin
        correo de por medio.
      </p>

      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: 400, margin: 0 }}>
        <label>
          Nombre
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            minLength={2}
            maxLength={80}
          />
        </label>

        <label>
          Correo electrónico
          <input type="email" name="email" value={form.email} onChange={handleChange} required />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            required
            minLength={6}
          />
        </label>

        <label>
          Teléfono (opcional)
          <input
            type="tel"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            maxLength={40}
            placeholder="55 1234 5678"
          />
        </label>

        <label>
          Rol
          <select name="role" value={form.role} onChange={handleChange}>
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Creando..." : "Crear usuario"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/users")}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default UserCreateForm;
