// src/components/UserList.jsx — administrador de usuarios registrados
// (clientes + staff). Mismo patrón que ProductList.jsx/OrderList.jsx: lista
// contra GET /api/users (ya trae _id/name/email/role/isVerified/createdAt,
// ver packages/core-api/modules/auth.js), editar navega a /admin/users/:id/edit
// (UserForm.jsx) y eliminar borra en línea con confirm().
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatCalendarDate } from "../utils/formatCalendarDate";
import { getCurrentUserId } from "../utils/currentUser";
import { ROLES, ROLE_LABELS } from "../utils/roles";

const formatDate = (value) => formatCalendarDate(value) || "—";

const ROLE_BADGE_COLORS = {
  [ROLES.SUPER_ADMIN]: "red",
  [ROLES.STORE_ADMIN]: "blue",
  [ROLES.COLLABORATOR]: "yellow",
  [ROLES.CUSTOMER]: "green",
};

const UserList = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
  const currentUserId = getCurrentUserId();

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      // GET /api/users no está paginado ni envuelto en { items } (a
      // diferencia de /api/orders o /api/products) — regresa el arreglo tal
      // cual, ver auth.js.
      const response = await axios.get(`${baseUrl}/api/users`, { headers: getAuthHeaders() });
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar los usuarios.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleDelete = async (user) => {
    if (
      !window.confirm(`¿Eliminar la cuenta de "${user.name}" (${user.email})? Esta acción no se puede deshacer.`)
    ) {
      return;
    }
    setError("");
    try {
      await axios.delete(`${baseUrl}/api/users/${user._id}`, { headers: getAuthHeaders() });
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar el usuario.");
    }
  };

  const filteredUsers = roleFilter ? users.filter((u) => u.role === roleFilter) : users;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Usuarios</h3>
      </div>
      <p>Cuentas registradas en el sitio — clientes de la tienda y staff del panel.</p>

      {error ? <div className="auth-error">{error}</div> : null}

      <label style={{ maxWidth: 260 }}>
        Filtrar por rol
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">Todos los roles</option>
          {Object.values(ROLES).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Rol</th>
            <th>Verificado</th>
            <th>Registrado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && filteredUsers.length === 0 ? (
            <tr>
              <td colSpan={6}>Sin usuarios registrados.</td>
            </tr>
          ) : null}
          {filteredUsers.map((u) => (
            <tr key={u._id}>
              <td>
                {u.name}
                {u._id === currentUserId ? " (tú)" : ""}
              </td>
              <td>{u.email}</td>
              <td>
                <span className={`badge badge-${ROLE_BADGE_COLORS[u.role] || "yellow"}`}>
                  {ROLE_LABELS[u.role] || u.role}
                </span>
              </td>
              <td>{u.isVerified ? "Sí" : "No"}</td>
              <td>{formatDate(u.createdAt)}</td>
              <td style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" onClick={() => navigate(`/admin/users/${u._id}/edit`)}>
                  Editar
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={u._id === currentUserId}
                  title={u._id === currentUserId ? "No puedes eliminar tu propia cuenta." : undefined}
                  onClick={() => handleDelete(u)}
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default UserList;
