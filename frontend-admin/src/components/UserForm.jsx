// src/components/UserForm.jsx — editar/eliminar un usuario registrado.
// PUT /api/users/:id solo acepta name/role (email es inmodificable, ver
// auth.js#validateUpdateUserPayload) y el backend ya aplica las reglas de
// negocio (nadie cambia su propio rol, store_admin no toca cuentas
// super_admin ni les asigna ese rol, nadie se borra a sí mismo) — esta
// pantalla solo refleja esas mismas reglas en la UI para no dejar que el
// usuario intente algo que de todos modos el servidor va a rechazar.
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";
import { getCurrentUserId } from "../utils/currentUser";
import { ROLES, ROLE_LABELS } from "../utils/roles";

const formatDate = (value) => formatCalendarDate(value) || "—";

const UserForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
  const actorRole = localStorage.getItem("role");
  const isSelf = getCurrentUserId() === id;

  const loadUser = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/users/${id}`, { headers: getAuthHeaders() });
      setUser(response.data);
      setName(response.data?.name || "");
      setPhone(response.data?.phone || "");
      setRole(response.data?.role || "");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar el usuario.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {};
      if (name !== user.name) payload.name = name;
      if (phone !== (user.phone || "")) payload.phone = phone;
      // Solo se manda `role` si de verdad cambió: PUT /:id dispara
      // CANNOT_CHANGE_OWN_ROLE en cuanto ve `role` en el body de tu propia
      // cuenta, aunque el valor sea el mismo que ya tenías (ver auth.js).
      if (role !== user.role) payload.role = role;

      if (Object.keys(payload).length === 0) {
        setMessage("No hay cambios que guardar.");
        return;
      }

      const response = await axios.put(`${baseUrl}/api/users/${id}`, payload, {
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      });
      setMessage("Usuario actualizado.");
      setUser(response.data?.user || { ...user, ...payload });
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible actualizar el usuario.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(`¿Eliminar la cuenta de "${user.name}" (${user.email})? Esta acción no se puede deshacer.`)
    ) {
      return;
    }
    setError("");
    try {
      await axios.delete(`${baseUrl}/api/users/${id}`, { headers: getAuthHeaders() });
      navigate("/admin/users");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar el usuario.");
    }
  };

  if (isLoading) return <p>Cargando...</p>;
  if (!user) return <p>{error || "Usuario no encontrado."}</p>;

  // store_admin no puede asignar (ni conservar mostrado como opción) el rol
  // super_admin — mismo límite que aplica el backend en PUT /:id.
  const assignableRoles = Object.values(ROLES).filter(
    (r) => r !== ROLES.SUPER_ADMIN || actorRole === ROLES.SUPER_ADMIN
  );

  return (
    <section>
      <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => navigate("/admin/users")}>
        ← Volver
      </button>

      <h3 style={{ marginTop: "1rem" }}>{user.name}</h3>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <div style={{ margin: "1rem 0" }}>
        <p>
          Correo: {user.email} <span style={{ fontSize: "0.8rem" }}>(no se puede modificar)</span>
        </p>
        <p>Verificado: {user.isVerified ? "Sí" : "No"}</p>
        <p>Registrado: {formatDate(user.createdAt)}</p>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 400, margin: 0 }}>
        <label>
          Nombre
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
        </label>

        <label>
          Teléfono (opcional)
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
            placeholder="55 1234 5678"
          />
        </label>

        <label>
          Rol
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        {isSelf ? <p style={{ fontSize: "0.8rem" }}>No puedes cambiar tu propio rol.</p> : null}

        <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
          {isSaving ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>

      {!isSelf ? (
        <button
          type="button"
          className="btn-danger"
          style={{ width: "auto", marginTop: "1.5rem" }}
          onClick={handleDelete}
        >
          Eliminar usuario
        </button>
      ) : (
        <p style={{ fontSize: "0.8rem", marginTop: "1.5rem" }}>No puedes eliminar tu propia cuenta.</p>
      )}
    </section>
  );
};

export default UserForm;
