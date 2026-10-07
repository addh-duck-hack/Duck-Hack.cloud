// Pestaña "Perfil" de "Configurar App" (módulo "appConfig"): el menú de la
// pantalla de perfil de la app móvil (packages/core-api/modules/appProfile.js).
// Grupos con título (los separadores: "Mi cuenta", "Soporte", "Legales"…) con
// opciones, más los botones de cerrar sesión y calificar la app. Cada opción:
// texto, quién la ve (siempre / con sesión / sin sesión) y qué hace (pantalla
// de la app, llamar, WhatsApp, correo, texto legal o enlace). Guardar publica.
// El backend valida todo y dice por opción si hoy no saldría en la app
// (`problems`): módulo no contratado, tienda sin teléfono, legal vacío…
// Reutiliza los estilos del editor del Home (AppHomeEditor.css).
import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import AppConfigTabs from "./AppConfigTabs";
import PhoneInput from "./PhoneInput";
import Loader from "./Loader";
import Alert from "./Alert";
import "./AppHomeEditor.css";

const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

const ACTION_TYPES = [
  { value: "screen", label: "Abrir una pantalla de la app" },
  { value: "phone", label: "Llamar por teléfono" },
  { value: "whatsapp", label: "Abrir WhatsApp" },
  { value: "email", label: "Enviar un correo" },
  { value: "legal", label: "Mostrar un texto legal" },
  { value: "url", label: "Abrir un enlace" },
];

const VISIBILITY_OPTIONS = [
  { value: "always", label: "Siempre" },
  { value: "auth", label: "Solo con sesión iniciada" },
  { value: "guest", label: "Solo sin sesión (invitados)" },
];

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Acción por defecto al cambiar de tipo.
const defaultAction = (type) => {
  if (type === "screen") return { type, screen: "profile" };
  if (type === "legal") return { type, page: "privacy" };
  if (type === "url") return { type, url: "", openIn: "webview" };
  if (type === "whatsapp") return { type, phone: "", message: "" };
  if (type === "email") return { type, email: "" };
  return { type, phone: "" };
};

const move = (list, index, delta) => {
  const next = [...list];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
};

const Field = ({ label, children, hint }) => (
  <label className="app-home-field">
    <span>{label}</span>
    {children}
    {hint ? <small>{hint}</small> : null}
  </label>
);

const formatWhatsapp = (value) => (value ? `+${value}` : "");

// Campos de la acción según su tipo (van dentro de un .app-home-row). `store` = contacto de Configurar tienda
// (lo que se usa si el campo se deja vacío).
const ActionFields = ({ action, onChange, screens, legalPages, store }) => {
  const set = (patch) => onChange({ ...action, ...patch });
  switch (action.type) {
    case "screen":
      return (
        <Field label="Pantalla">
          <select value={action.screen} onChange={(e) => set({ screen: e.target.value })}>
            {screens.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      );
    case "phone":
      return (
        <Field label="Teléfono (opcional)" hint={store.contactPhone ? `Vacío = el de la tienda (${store.contactPhone}).` : "La tienda no tiene teléfono de contacto: escríbelo aquí."}>
          <PhoneInput name="phone" value={action.phone || ""} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
      );
    case "whatsapp":
      return (
        <>
          <Field
            label="Número de WhatsApp (opcional)"
            hint={store.whatsapp || store.contactPhone ? `Vacío = el de la tienda (${formatWhatsapp(store.whatsapp) || store.contactPhone}).` : "La tienda no tiene WhatsApp: escríbelo aquí."}
          >
            <PhoneInput name="phone" prefix="+52" value={action.phone || ""} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Mensaje prellenado (opcional)" hint="Vacío = el mensaje del botón de WhatsApp de la tienda.">
            <input type="text" value={action.message || ""} maxLength={300} onChange={(e) => set({ message: e.target.value })} />
          </Field>
        </>
      );
    case "email":
      return (
        <Field label="Correo (opcional)" hint={store.contactEmail ? `Vacío = el de la tienda (${store.contactEmail}).` : "La tienda no tiene correo de contacto: escríbelo aquí."}>
          <input type="email" value={action.email || ""} maxLength={160} onChange={(e) => set({ email: e.target.value })} />
        </Field>
      );
    case "legal":
      return (
        <Field label="Texto legal" hint="Se muestra el texto escrito en Configurar tienda → Identidad legal, en una página limpia con el logo de la tienda.">
          <select value={action.page} onChange={(e) => set({ page: e.target.value })}>
            {legalPages.map((p) => (
              <option key={p.key} value={p.key}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
      );
    case "url":
      return (
        <>
          <Field label="URL">
            <input type="url" value={action.url || ""} maxLength={500} placeholder="https://" onChange={(e) => set({ url: e.target.value })} />
          </Field>
          <Field label="Abrir en">
            <select value={action.openIn || "webview"} onChange={(e) => set({ openIn: e.target.value })}>
              <option value="webview">Dentro de la app</option>
              <option value="browser">Navegador del teléfono</option>
            </select>
          </Field>
        </>
      );
    default:
      return null;
  }
};

const AppProfileEditor = () => {
  const baseUrl = getApiBaseUrl();
  const [profile, setProfile] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [meta, setMeta] = useState({ screens: [], legalPages: [], store: {}, problems: {}, isDefault: false, updatedAt: null });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const snapshot = (p) => JSON.stringify(p ? { groups: p.groups, logout: p.logout, rateApp: p.rateApp } : null);
  const isDirty = profile && snapshot(profile) !== savedSnapshot;

  const applyServerData = (data) => {
    const next = { groups: data.groups || [], logout: data.logout || {}, rateApp: data.rateApp || {} };
    setProfile(next);
    setSavedSnapshot(snapshot(next));
    setMeta({ screens: data.screens || [], legalPages: data.legalPages || [], store: data.store || {}, problems: data.problems || {}, isDefault: data.isDefault, updatedAt: data.updatedAt });
  };

  const load = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/app-profile`, { headers: getAuthHeaders() });
      applyServerData(response.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar el perfil de la app.");
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
      const response = await axios.put(`${baseUrl}/api/app-profile`, profile, { headers: getAuthHeaders() });
      applyServerData(response.data);
      setMessage("Perfil publicado: la app lo verá la próxima vez que abra el perfil.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar el perfil de la app.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !profile) return isLoading ? <Loader /> : <div className="app-home">{error ? <Alert type="error">{error}</Alert> : null}</div>;

  const setGroups = (updater) => setProfile((p) => ({ ...p, groups: updater(p.groups) }));
  const updateGroup = (gi, patch) => setGroups((groups) => groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const updateItem = (gi, ii, patch) =>
    setGroups((groups) => groups.map((g, i) => (i === gi ? { ...g, items: g.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : g)));
  const addItem = (gi) =>
    setGroups((groups) =>
      groups.map((g, i) => (i === gi ? { ...g, items: [...g.items, { id: newId(), label: "", visibility: "always", action: defaultAction("screen") }] } : g))
    );
  const removeGroup = (gi) => {
    const group = profile.groups[gi];
    if (group.items.length && !window.confirm(`¿Quitar el grupo "${group.title || "sin título"}" y sus ${group.items.length} opciones?`)) return;
    setGroups((groups) => groups.filter((_, i) => i !== gi));
  };
  const screenLabel = (key) => meta.screens.find((s) => s.key === key)?.label;
  const screenAuth = (key) => meta.screens.find((s) => s.key === key)?.auth;

  return (
    <div className="app-home">
      <AppConfigTabs />
      <div className="app-home-header">
        <div>
          <h3>Perfil de la app</h3>
          <div className="app-home-hint">
            Menú de la pantalla de perfil: grupos con su título (los separadores) y sus opciones, más los botones de abajo.
            Guardar publica los cambios sin publicar una versión nueva de la app.
            {meta.isDefault ? " Aún no se ha guardado: la app usa este perfil sugerido." : meta.updatedAt ? ` Última publicación: ${new Date(meta.updatedAt).toLocaleString()}.` : ""}
          </div>
        </div>
        <div className="app-home-actions">
          <button type="button" className="btn-secondary" onClick={load} disabled={isSaving}>
            Recargar
          </button>
          <button type="button" className="app-home-save" onClick={save} disabled={isSaving || (!isDirty && !meta.isDefault)}>
            {isSaving ? "Guardando..." : "Guardar y publicar"}
          </button>
        </div>
      </div>

      {isDirty ? <div className="app-home-dirty">Tienes cambios sin guardar.</div> : null}
      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <ol className="app-home-list">
        {profile.groups.map((group, gi) => (
          <li key={group.id || gi} className="app-home-section">
            <div className="app-home-section-head">
              <div className="app-home-field" style={{ flex: "1 1 240px" }}>
                <input type="text" value={group.title} maxLength={60} placeholder="Título del grupo (ej. Mi cuenta)" onChange={(e) => updateGroup(gi, { title: e.target.value })} aria-label="Título del grupo" />
              </div>
              <div className="app-home-actions">
                <button type="button" className="btn-secondary" disabled={gi === 0} onClick={() => setGroups((g) => move(g, gi, -1))} title="Subir grupo">
                  <i className="fas fa-arrow-up" aria-hidden="true" />
                </button>
                <button type="button" className="btn-secondary" disabled={gi === profile.groups.length - 1} onClick={() => setGroups((g) => move(g, gi, 1))} title="Bajar grupo">
                  <i className="fas fa-arrow-down" aria-hidden="true" />
                </button>
                <button type="button" className="btn-danger" onClick={() => removeGroup(gi)} title="Quitar grupo">
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="app-home-form">
              <div className="app-home-items">
                {group.items.length === 0 ? <div className="app-home-hint">Este grupo no tiene opciones: no se mostrará en la app.</div> : null}
                {group.items.map((item, ii) => {
                  const problem = meta.problems[item.id];
                  return (
                    <div key={item.id || ii} className="app-home-item">
                      <div className="app-home-item-head">
                        <strong>{item.label || "Opción sin texto"}</strong>
                        <div className="app-home-actions">
                          <button type="button" className="btn-secondary" disabled={ii === 0} onClick={() => updateGroup(gi, { items: move(group.items, ii, -1) })} title="Subir">
                            <i className="fas fa-arrow-up" aria-hidden="true" />
                          </button>
                          <button type="button" className="btn-secondary" disabled={ii === group.items.length - 1} onClick={() => updateGroup(gi, { items: move(group.items, ii, 1) })} title="Bajar">
                            <i className="fas fa-arrow-down" aria-hidden="true" />
                          </button>
                          <button type="button" className="btn-danger" onClick={() => updateGroup(gi, { items: group.items.filter((_, j) => j !== ii) })} title="Quitar opción">
                            <i className="fas fa-trash" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      {problem ? <div className="auth-error">No se mostrará en la app: {problem}</div> : null}
                      <div className="app-home-row">
                        <Field label="Texto">
                          <input type="text" value={item.label} maxLength={60} required onChange={(e) => updateItem(gi, ii, { label: e.target.value })} />
                        </Field>
                        <Field label="Qué hace">
                          <select
                            value={item.action?.type}
                            onChange={(e) => updateItem(gi, ii, { action: defaultAction(e.target.value), visibility: e.target.value === "screen" ? "auth" : "always" })}
                          >
                            {ACTION_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Quién la ve">
                          <select value={item.visibility || "always"} onChange={(e) => updateItem(gi, ii, { visibility: e.target.value })}>
                            {VISIBILITY_OPTIONS.map((v) => (
                              <option key={v.value} value={v.value}>
                                {v.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <div className="app-home-row">
                      <ActionFields
                        action={item.action || defaultAction("screen")}
                        onChange={(action) =>
                          updateItem(gi, ii, {
                            action,
                            // Al elegir pantalla, sugiere el texto y quién la ve.
                            ...(action.type === "screen" && action.screen !== item.action?.screen
                              ? { visibility: screenAuth(action.screen) ? "auth" : "guest", ...(!item.label || item.label === screenLabel(item.action?.screen) ? { label: screenLabel(action.screen) } : {}) }
                              : {}),
                          })
                        }
                        screens={meta.screens}
                        legalPages={meta.legalPages}
                        store={meta.store}
                      />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <button type="button" className="btn-secondary" onClick={() => addItem(gi)}>
                  <i className="fas fa-plus" aria-hidden="true" /> Agregar opción
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="app-home-add">
        <button type="button" className="btn-secondary" onClick={() => setGroups((groups) => [...groups, { id: newId(), title: "", items: [] }])}>
          <i className="fas fa-plus" aria-hidden="true" /> Agregar grupo
        </button>
      </div>

      <h4 style={{ marginTop: "2rem" }}>Botones al final del perfil</h4>
      <div className="app-home-list">
        <div className="app-home-section">
          <div className="app-home-form" style={{ borderTop: 0 }}>
            <div className="app-home-row">
              <label className="app-home-switch">
                <input
                  type="checkbox"
                  checked={profile.logout?.enabled !== false}
                  onChange={(e) => setProfile((p) => ({ ...p, logout: { ...p.logout, enabled: e.target.checked } }))}
                />
                Botón "Cerrar sesión" (solo se ve con sesión iniciada)
              </label>
              <Field label="Texto">
                <input type="text" value={profile.logout?.label || ""} maxLength={40} placeholder="Cerrar sesión" onChange={(e) => setProfile((p) => ({ ...p, logout: { ...p.logout, label: e.target.value } }))} />
              </Field>
            </div>
          </div>
        </div>
        <div className="app-home-section">
          <div className="app-home-form" style={{ borderTop: 0 }}>
            <div className="app-home-row">
              <label className="app-home-switch">
                <input
                  type="checkbox"
                  checked={Boolean(profile.rateApp?.enabled)}
                  onChange={(e) => setProfile((p) => ({ ...p, rateApp: { ...p.rateApp, enabled: e.target.checked } }))}
                />
                Botón "Calificar la app"
              </label>
              <Field label="Texto">
                <input type="text" value={profile.rateApp?.label || ""} maxLength={40} placeholder="Calificar la app" onChange={(e) => setProfile((p) => ({ ...p, rateApp: { ...p.rateApp, label: e.target.value } }))} />
              </Field>
            </div>
            {profile.rateApp?.enabled ? (
              <div className="app-home-row">
                <Field label="ID de la app en App Store" hint="Solo números; está en el enlace de la app (apps.apple.com/…/id1234567890).">
                  <input type="text" inputMode="numeric" value={profile.rateApp?.iosAppId || ""} maxLength={15} onChange={(e) => setProfile((p) => ({ ...p, rateApp: { ...p.rateApp, iosAppId: e.target.value.replace(/\D/g, "") } }))} />
                </Field>
                <Field label="Paquete en Google Play" hint="Ej. com.tienda.app (está en el enlace de Play: ?id=…).">
                  <input type="text" value={profile.rateApp?.androidPackage || ""} maxLength={150} onChange={(e) => setProfile((p) => ({ ...p, rateApp: { ...p.rateApp, androidPackage: e.target.value.trim() } }))} />
                </Field>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppProfileEditor;
