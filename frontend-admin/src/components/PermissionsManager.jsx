// "Permisos" (solo super_admin): qué módulos contrató esta tienda y qué puede
// usar cada rol (store_admin, collaborator) — GET/PUT /api/permissions, ver
// packages/core-api/lib/permissions.js. El backend los hace cumplir en cada
// request; super_admin siempre ve todo y no se configura.
import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { ROLE_LABELS } from "../utils/roles";
import Loader from "./Loader";
import "./PermissionsManager.css";

const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const toggle = (list, key, on) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key));
const snapshot = (enabledModules, roles) => JSON.stringify({ enabledModules: [...enabledModules].sort(), roles: Object.fromEntries(Object.entries(roles).map(([r, l]) => [r, [...l].sort()])) });

const PermissionsManager = () => {
  const baseUrl = getApiBaseUrl();
  const [catalog, setCatalog] = useState([]);
  const [configurableRoles, setConfigurableRoles] = useState([]);
  const [defaults, setDefaults] = useState(null);
  const [enabledModules, setEnabledModules] = useState([]);
  const [roles, setRoles] = useState({});
  const [saved, setSaved] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const apply = (data) => {
    setCatalog(data.catalog || []);
    setConfigurableRoles(data.configurableRoles || []);
    setDefaults(data.defaults || null);
    setEnabledModules(data.enabledModules || []);
    setRoles(data.roles || {});
    setSaved(snapshot(data.enabledModules || [], data.roles || {}));
    setUpdatedAt(data.updatedAt || null);
  };

  const load = async () => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/permissions`, { headers: getAuthHeaders() });
      apply(response.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar los permisos.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.put(`${baseUrl}/api/permissions`, { enabledModules, roles }, { headers: getAuthHeaders() });
      apply(response.data);
      setMessage(response.data?.message || "Permisos guardados.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar los permisos.");
    } finally {
      setIsSaving(false);
    }
  };

  const restoreDefaults = () => {
    if (!defaults) return;
    setEnabledModules([...defaults.enabledModules]);
    setRoles(Object.fromEntries(Object.entries(defaults.roles).map(([role, list]) => [role, [...list]])));
    setMessage("Se cargaron los valores por default. Guarda para aplicarlos.");
  };

  if (isLoading) return <Loader />;

  const isDirty = snapshot(enabledModules, roles) !== saved;

  return (
    <section className="permissions">
      <div className="permissions-header">
        <div>
          <h2>Permisos</h2>
          <div className="permissions-hint">
            Qué módulos contrató esta tienda y qué puede usar cada rol. Solo tú (super_admin) ves esta pantalla, y
            siempre tienes acceso a todo. Los cambios aplican de inmediato: los usuarios afectados los ven la próxima vez
            que carguen el panel.
            {updatedAt ? ` Última modificación: ${new Date(updatedAt).toLocaleString()}.` : " Esta tienda usa los permisos por default."}
          </div>
        </div>
        <div className="permissions-actions">
          <button type="button" className="btn-secondary" onClick={restoreDefaults} disabled={isSaving}>
            Valores por default
          </button>
          <button type="button" onClick={save} disabled={isSaving || !isDirty}>
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      {isDirty ? <div className="permissions-dirty">Tienes cambios sin guardar.</div> : null}
      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <table className="permissions-table">
        <thead>
          <tr>
            <th>Módulo</th>
            <th>Contratado</th>
            {configurableRoles.map((role) => (
              <th key={role}>{ROLE_LABELS[role] || role}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {catalog.map((module) => {
            const isEnabled = enabledModules.includes(module.key);
            return (
              <tr key={module.key} className={isEnabled ? "" : "is-disabled"}>
                <td>{module.label}</td>
                <td>
                  <label className="permissions-check">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => setEnabledModules((current) => toggle(current, module.key, e.target.checked))}
                      aria-label={`${module.label} contratado`}
                    />
                  </label>
                </td>
                {configurableRoles.map((role) => (
                  <td key={role}>
                    <label className="permissions-check" title={isEnabled ? "" : "La tienda no tiene este módulo contratado"}>
                      <input
                        type="checkbox"
                        checked={(roles[role] || []).includes(module.key)}
                        disabled={!isEnabled}
                        onChange={(e) =>
                          setRoles((current) => ({ ...current, [role]: toggle(current[role] || [], module.key, e.target.checked) }))
                        }
                        aria-label={`${module.label} para ${ROLE_LABELS[role] || role}`}
                      />
                    </label>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="permissions-hint permissions-notes">
        <p>
          Si un módulo no está contratado, nadie más que tú lo ve, aunque su rol lo tenga marcado; al volver a contratarlo,
          los roles recuperan lo que tenían marcado.
        </p>
        <p>
          Algunas pantallas consultan datos de otros módulos: con Pedidos o Inventario se puede elegir productos, y con
          Configurar tienda o Productos se usa el selector de Medios, aunque esos módulos no estén marcados. Clientes,
          Contabilidad y Facturación se consultan entre sí solo si el módulo consultado está contratado.
        </p>
        <p>
          En Usuarios, nadie puede ver, crear ni editar cuentas de un rol mayor al suyo (un Colaborador no puede tocar a un
          Administrador de tienda).
        </p>
      </div>
    </section>
  );
};

export default PermissionsManager;
