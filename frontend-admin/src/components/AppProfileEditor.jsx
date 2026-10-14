// Pestaña "Perfil" de "Configurar App" (módulo "appConfig"): el menú de la
// pantalla de perfil de la app móvil (packages/core-api/modules/appProfile.js).
// Grupos con título (los separadores: "Mi cuenta", "Soporte", "Legales"…) con
// opciones, más los botones de cerrar sesión y calificar la app. Cada opción:
// texto, quién la ve (siempre / con sesión / sin sesión) y qué hace (pantalla
// de la app, llamar, WhatsApp, correo, texto legal o enlace). Guardar publica.
// El backend valida todo y dice por opción si hoy no saldría en la app
// (`problems`): módulo no contratado, tienda sin teléfono, legal vacío…
// Mismo diseño que el editor del Home (AppHomeEditor.jsx / .css): filas
// plegables con ícono, título y resumen; vista Visual y JSON avanzado.
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
  { value: "screen", label: "Abrir una pantalla de la app", short: "Pantalla", icon: "fas fa-mobile-screen" },
  { value: "phone", label: "Llamar por teléfono", short: "Llamar", icon: "fas fa-phone" },
  { value: "whatsapp", label: "Abrir WhatsApp", short: "WhatsApp", icon: "fab fa-whatsapp" },
  { value: "email", label: "Enviar un correo", short: "Correo", icon: "fas fa-envelope" },
  { value: "legal", label: "Mostrar un texto legal", short: "Texto legal", icon: "fas fa-scale-balanced" },
  { value: "url", label: "Abrir un enlace", short: "Enlace", icon: "fas fa-link" },
];
const ACTION_BY_TYPE = Object.fromEntries(ACTION_TYPES.map((t) => [t.value, t]));

const VISIBILITY_OPTIONS = [
  { value: "always", label: "Siempre" },
  { value: "auth", label: "Solo con sesión iniciada" },
  { value: "guest", label: "Solo sin sesión (invitados)" },
];
const VISIBILITY_SHORT = { always: "Todos", auth: "Con sesión", guest: "Invitados" };

const toJsonText = (profile) => JSON.stringify(profile, null, 2);

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

// Resumen de una línea de lo que hace una opción (como summarizeSection del Home).
const summarizeAction = (action, { screens, legalPages, store }) => {
  switch (action?.type) {
    case "screen":
      return screens.find((s) => s.key === action.screen)?.label || action.screen;
    case "phone":
      return action.phone || (store.contactPhone ? `${store.contactPhone} (de la tienda)` : "sin teléfono");
    case "whatsapp":
      return action.phone ? `+52 ${action.phone}` : store.whatsapp || store.contactPhone ? "número de la tienda" : "sin número";
    case "email":
      return action.email || (store.contactEmail ? `${store.contactEmail} (de la tienda)` : "sin correo");
    case "legal":
      return legalPages.find((p) => p.key === action.page)?.title || action.page;
    case "url":
      return action.url || "sin URL";
    default:
      return "Acción no soportada por este editor (se conserva tal cual)";
  }
};

// Botones de subir / bajar / quitar de una fila.
const RowActions = ({ index, count, onMove, onRemove, removeTitle }) => (
  <div className="app-home-actions">
    <button type="button" className="btn-secondary" disabled={index === 0} onClick={() => onMove(-1)} title="Subir">
      <i className="fas fa-arrow-up" aria-hidden="true" />
    </button>
    <button type="button" className="btn-secondary" disabled={index === count - 1} onClick={() => onMove(1)} title="Bajar">
      <i className="fas fa-arrow-down" aria-hidden="true" />
    </button>
    <button type="button" className="btn-danger" onClick={onRemove} title={removeTitle}>
      <i className="fas fa-trash" aria-hidden="true" />
    </button>
  </div>
);

// Cabecera plegable (ícono + título + resumen + flecha), igual que el Home.
const RowToggle = ({ icon, title, summary, isExpanded, onToggle }) => (
  <button type="button" className="app-home-section-toggle" onClick={onToggle} aria-expanded={isExpanded}>
    <i className={icon} aria-hidden="true" />
    <span className="app-home-section-text">
      <strong>{title}</strong>
      <small>{summary}</small>
    </span>
    <i className={`fas fa-chevron-${isExpanded ? "up" : "down"}`} aria-hidden="true" />
  </button>
);

const AppProfileEditor = () => {
  const baseUrl = getApiBaseUrl();
  const [profile, setProfile] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [meta, setMeta] = useState({ screens: [], legalPages: [], store: {}, problems: {}, isDefault: false, updatedAt: null });
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);
  const [expandedButton, setExpandedButton] = useState(null);
  const [newItemType, setNewItemType] = useState({});
  const [view, setView] = useState("visual");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const pick = (p) => ({ groups: p.groups, logout: p.logout, rateApp: p.rateApp });
  const isDirty = profile && JSON.stringify(pick(profile)) !== savedSnapshot;

  const applyServerData = (data) => {
    const next = { groups: data.groups || [], logout: data.logout || {}, rateApp: data.rateApp || {} };
    setProfile(next);
    setSavedSnapshot(JSON.stringify(next));
    setJsonText(toJsonText(next));
    setMeta({ screens: data.screens || [], legalPages: data.legalPages || [], store: data.store || {}, problems: data.problems || {}, isDefault: data.isDefault, updatedAt: data.updatedAt });
  };

  const load = async () => {
    setIsLoading(true);
    setError("");
    setMessage("");
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
      const response = await axios.put(`${baseUrl}/api/app-profile`, pick(profile), { headers: getAuthHeaders() });
      applyServerData(response.data);
      setMessage("Perfil publicado: la app lo verá la próxima vez que abra el perfil.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar el perfil de la app.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <Loader />;
  if (!profile) return <div className="app-home">{error ? <Alert type="error">{error}</Alert> : null}</div>;

  const setGroups = (updater) => setProfile((p) => ({ ...p, groups: updater(p.groups) }));
  const updateGroup = (gi, patch) => setGroups((groups) => groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const updateItem = (gi, ii, patch) =>
    setGroups((groups) => groups.map((g, i) => (i === gi ? { ...g, items: g.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : g)));
  const screenOf = (key) => meta.screens.find((s) => s.key === key);

  const addGroup = () => {
    const group = { id: newId(), title: "", items: [] };
    setGroups((groups) => [...groups, group]);
    setExpandedGroup(group.id);
  };
  const removeGroup = (gi) => {
    const group = profile.groups[gi];
    if (!window.confirm(`¿Quitar el grupo "${group.title || "sin título"}"${group.items.length ? ` y sus ${group.items.length} opciones` : ""}?`)) return;
    setGroups((groups) => groups.filter((_, i) => i !== gi));
  };
  const addItem = (gi) => {
    const type = newItemType[profile.groups[gi].id] || "screen";
    const action = defaultAction(type);
    const screen = type === "screen" ? screenOf(action.screen) : null;
    const item = { id: newId(), label: screen?.label || "", visibility: type === "screen" ? (screen?.auth ? "auth" : "guest") : "always", action };
    updateGroup(gi, { items: [...profile.groups[gi].items, item] });
    setExpandedItem(item.id);
  };
  const removeItem = (gi, ii) => {
    const item = profile.groups[gi].items[ii];
    if (!window.confirm(`¿Quitar la opción "${item.label || "sin texto"}"?`)) return;
    updateGroup(gi, { items: profile.groups[gi].items.filter((_, j) => j !== ii) });
  };

  // Cambiar qué hace la opción: acción nueva y, si es pantalla, sugiere
  // texto y quién la ve.
  const changeAction = (gi, ii, item, action) => {
    const patch = { action };
    if (action.type === "screen" && action.screen !== item.action?.screen) {
      const next = screenOf(action.screen);
      const previous = item.action?.type === "screen" ? screenOf(item.action.screen) : null;
      patch.visibility = next?.auth ? "auth" : "guest";
      if (!item.label || item.label === previous?.label) patch.label = next?.label || item.label;
    }
    if (action.type !== item.action?.type && action.type !== "screen") patch.visibility = "always";
    updateItem(gi, ii, patch);
  };

  const switchView = (next) => {
    if (next === view) return;
    if (next === "json") {
      setJsonText(toJsonText(pick(profile)));
      setJsonError("");
    } else if (jsonText !== toJsonText(pick(profile)) && !window.confirm("El JSON tiene cambios sin aplicar. ¿Descartarlos?")) {
      return;
    }
    setView(next);
  };

  // Acepta { groups, logout, rateApp }; solo revisa la forma general, el
  // detalle lo valida el backend al guardar.
  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.groups)) throw new Error('Debe ser un objeto { "groups": [...], "logout": {...}, "rateApp": {...} }.');
      parsed.groups.forEach((g, i) => {
        if (!g || typeof g !== "object" || !Array.isArray(g.items)) throw new Error(`groups[${i}] necesita "items" (arreglo).`);
      });
      setProfile({ groups: parsed.groups, logout: parsed.logout || {}, rateApp: parsed.rateApp || {} });
      setJsonError("");
      setView("visual");
      setMessage("JSON aplicado. Revisa y guarda para publicarlo.");
    } catch (err) {
      setJsonError(err instanceof SyntaxError ? `JSON inválido: ${err.message}` : err.message);
    }
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setMessage("JSON copiado al portapapeles.");
    } catch {
      setError("No fue posible copiar; selecciona el texto y cópialo a mano.");
    }
  };

  const logout = profile.logout || {};
  const rateApp = profile.rateApp || {};
  const setLogout = (patch) => setProfile((p) => ({ ...p, logout: { ...p.logout, ...patch } }));
  const setRateApp = (patch) => setProfile((p) => ({ ...p, rateApp: { ...p.rateApp, ...patch } }));
  const rateSummary = [rateApp.iosAppId ? "App Store" : "", rateApp.androidPackage ? "Google Play" : ""].filter(Boolean).join(" y ");

  return (
    <div className="app-home">
      <AppConfigTabs />
      <div className="app-home-header">
        <div>
          <h3>Perfil de la app</h3>
          <div className="app-home-hint">
            Menú de la pantalla de perfil de la app móvil: grupos con su título (los separadores) y sus opciones, y los
            botones del final. Guardar publica los cambios: la app los ve la próxima vez que abra el perfil, sin publicar
            una versión nueva.
            {meta.isDefault ? " Aún no se ha publicado: la app usa este perfil sugerido." : meta.updatedAt ? ` Última publicación: ${new Date(meta.updatedAt).toLocaleString()}.` : ""}
          </div>
        </div>
        <div className="app-home-actions">
          <button type="button" className="btn-secondary" onClick={load} disabled={isSaving}>
            Recargar
          </button>
          <button type="button" className="app-home-save" onClick={save} disabled={isSaving || (!isDirty && !meta.isDefault) || view === "json"}>
            {isSaving ? "Guardando..." : "Guardar y publicar"}
          </button>
        </div>
      </div>

      {isDirty ? <div className="app-home-dirty">Tienes cambios sin guardar.</div> : null}
      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <div className="app-home-tabs">
        <button type="button" className={`btn-secondary${view === "visual" ? " active" : ""}`} onClick={() => switchView("visual")}>
          <i className="fas fa-list" aria-hidden="true" /> Visual
        </button>
        <button type="button" className={`btn-secondary${view === "json" ? " active" : ""}`} onClick={() => switchView("json")}>
          <i className="fas fa-code" aria-hidden="true" /> JSON avanzado
        </button>
      </div>

      {view === "visual" ? (
        <>
          {profile.groups.length === 0 ? <div className="app-home-empty">El perfil no tiene grupos todavía.</div> : null}

          <ol className="app-home-list">
            {profile.groups.map((group, gi) => {
              const isExpanded = expandedGroup === group.id;
              const hidden = group.items.filter((it) => meta.problems[it.id]).length;
              const summary = group.items.length
                ? `${group.items.length} opción(es): ${group.items.map((it) => it.label || "sin texto").join(", ")}${hidden ? ` · ${hidden} no se mostrará(n)` : ""}`
                : "Sin opciones — no se mostrará";
              return (
                <li key={group.id || gi} className={`app-home-section${group.items.length === 0 ? " is-hidden" : ""}`}>
                  <div className="app-home-section-head">
                    <RowToggle
                      icon="fas fa-layer-group"
                      title={group.title || "Grupo sin título"}
                      summary={summary}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedGroup(isExpanded ? null : group.id)}
                    />
                    <RowActions index={gi} count={profile.groups.length} onMove={(d) => setGroups((g) => move(g, gi, d))} onRemove={() => removeGroup(gi)} removeTitle="Quitar grupo" />
                  </div>

                  {isExpanded ? (
                    <div className="app-home-form">
                      <Field label="Título del grupo" hint="Se muestra como separador arriba de sus opciones (ej. Mi cuenta, Soporte, Legales).">
                        <input type="text" value={group.title} maxLength={60} onChange={(e) => updateGroup(gi, { title: e.target.value })} />
                      </Field>

                      <div className="app-home-items">
                        {group.items.length === 0 ? <div className="app-home-empty">Este grupo no tiene opciones todavía.</div> : null}
                        {group.items.map((item, ii) => {
                          const type = ACTION_BY_TYPE[item.action?.type];
                          const problem = meta.problems[item.id];
                          const itemExpanded = expandedItem === item.id;
                          return (
                            <div key={item.id || ii} className={`app-home-section${problem ? " is-hidden" : ""}`}>
                              <div className="app-home-section-head">
                                <RowToggle
                                  icon={type?.icon || "fas fa-question"}
                                  title={item.label || "Opción sin texto"}
                                  summary={`${type?.short || item.action?.type} · ${summarizeAction(item.action, meta)} · ${VISIBILITY_SHORT[item.visibility] || "Todos"}${problem ? " · no se mostrará" : ""}`}
                                  isExpanded={itemExpanded}
                                  onToggle={() => setExpandedItem(itemExpanded ? null : item.id)}
                                />
                                <RowActions
                                  index={ii}
                                  count={group.items.length}
                                  onMove={(d) => updateGroup(gi, { items: move(group.items, ii, d) })}
                                  onRemove={() => removeItem(gi, ii)}
                                  removeTitle="Quitar opción"
                                />
                              </div>
                              {itemExpanded ? (
                                <div className="app-home-form">
                                  {problem ? <div className="auth-error">No se mostrará en la app: {problem}</div> : null}
                                  <div className="app-home-row">
                                    <Field label="Texto">
                                      <input type="text" value={item.label} maxLength={60} onChange={(e) => updateItem(gi, ii, { label: e.target.value })} />
                                    </Field>
                                    <Field label="Qué hace">
                                      <select value={item.action?.type} onChange={(e) => changeAction(gi, ii, item, defaultAction(e.target.value))}>
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
                                      onChange={(action) => changeAction(gi, ii, item, action)}
                                      screens={meta.screens}
                                      legalPages={meta.legalPages}
                                      store={meta.store}
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>

                      <div className="app-home-add">
                        <select value={newItemType[group.id] || "screen"} onChange={(e) => setNewItemType((m) => ({ ...m, [group.id]: e.target.value }))}>
                          {ACTION_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <button type="button" className="btn-secondary" onClick={() => addItem(gi)}>
                          <i className="fas fa-plus" aria-hidden="true" /> Agregar opción
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div className="app-home-add">
            <button type="button" className="btn-secondary" onClick={addGroup}>
              <i className="fas fa-plus" aria-hidden="true" /> Agregar grupo
            </button>
          </div>

          <h4 style={{ margin: "2rem 0 0.75rem" }}>Botones al final del perfil</h4>
          <ol className="app-home-list">
            <li className={`app-home-section${logout.enabled === false ? " is-hidden" : ""}`}>
              <div className="app-home-section-head">
                <RowToggle
                  icon="fas fa-right-from-bracket"
                  title={logout.label || "Cerrar sesión"}
                  summary="Botón de cerrar sesión · solo se ve con sesión iniciada"
                  isExpanded={expandedButton === "logout"}
                  onToggle={() => setExpandedButton(expandedButton === "logout" ? null : "logout")}
                />
                <div className="app-home-actions">
                  <label className="app-home-switch" title={logout.enabled === false ? "Oculto en la app" : "Visible en la app"}>
                    <input type="checkbox" checked={logout.enabled !== false} onChange={(e) => setLogout({ enabled: e.target.checked })} />
                    {logout.enabled === false ? "Oculto" : "Visible"}
                  </label>
                </div>
              </div>
              {expandedButton === "logout" ? (
                <div className="app-home-form">
                  <Field label="Texto del botón">
                    <input type="text" value={logout.label || ""} maxLength={40} placeholder="Cerrar sesión" onChange={(e) => setLogout({ label: e.target.value })} />
                  </Field>
                </div>
              ) : null}
            </li>

            <li className={`app-home-section${rateApp.enabled ? "" : " is-hidden"}`}>
              <div className="app-home-section-head">
                <RowToggle
                  icon="fas fa-star"
                  title={rateApp.label || "Calificar la app"}
                  summary={`Botón para calificar la app · ${rateSummary ? `lleva a ${rateSummary}` : "falta el ID de App Store o el paquete de Google Play"}`}
                  isExpanded={expandedButton === "rate"}
                  onToggle={() => setExpandedButton(expandedButton === "rate" ? null : "rate")}
                />
                <div className="app-home-actions">
                  <label className="app-home-switch" title={rateApp.enabled ? "Visible en la app" : "Oculto en la app"}>
                    <input
                      type="checkbox"
                      checked={Boolean(rateApp.enabled)}
                      onChange={(e) => {
                        setRateApp({ enabled: e.target.checked });
                        if (e.target.checked && !rateSummary) setExpandedButton("rate");
                      }}
                    />
                    {rateApp.enabled ? "Visible" : "Oculto"}
                  </label>
                </div>
              </div>
              {expandedButton === "rate" ? (
                <div className="app-home-form">
                  <Field label="Texto del botón">
                    <input type="text" value={rateApp.label || ""} maxLength={40} placeholder="Calificar la app" onChange={(e) => setRateApp({ label: e.target.value })} />
                  </Field>
                  <div className="app-home-row">
                    <Field label="ID de la app en App Store" hint="Solo números; está en el enlace de la app (apps.apple.com/…/id1234567890).">
                      <input type="text" inputMode="numeric" value={rateApp.iosAppId || ""} maxLength={15} onChange={(e) => setRateApp({ iosAppId: e.target.value.replace(/\D/g, "") })} />
                    </Field>
                    <Field label="Paquete en Google Play" hint="Ej. com.tienda.app (está en el enlace de Play: ?id=…).">
                      <input type="text" value={rateApp.androidPackage || ""} maxLength={150} onChange={(e) => setRateApp({ androidPackage: e.target.value.trim() })} />
                    </Field>
                  </div>
                </div>
              ) : null}
            </li>
          </ol>
        </>
      ) : (
        <div className="app-home-json">
          <div className="app-home-hint">
            Estructura completa del perfil. Puedes pegar un JSON, <b>Aplicar</b> para cargarlo en el editor visual y luego{" "}
            <b>Guardar y publicar</b>. El servidor valida todo al guardar.
          </div>
          <textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} rows={24} />
          {jsonError ? <div className="auth-error">{jsonError}</div> : null}
          <div className="app-home-actions">
            <button type="button" className="btn-secondary" onClick={copyJson}>
              <i className="fas fa-copy" aria-hidden="true" /> Copiar
            </button>
            <button type="button" className="btn-secondary" onClick={() => setJsonText(toJsonText(pick(profile)))}>
              Deshacer cambios del JSON
            </button>
            <button type="button" className="app-home-save" onClick={applyJson}>
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppProfileEditor;
