// Pestaña "Home" de "Configurar App" (módulo "appConfig") — el JSON que devuelve
// GET /api/app-home/public y con el que la app arma su pantalla de inicio sin
// publicar una versión nueva (ver packages/core-api/modules/appHome.js).
// Dos vistas sobre el mismo estado `sections`: Visual (switch de visible,
// orden, formulario por tipo) y JSON (ver/pegar el arreglo completo). Guardar
// publica: la app lo ve en su siguiente carga. El backend valida todo.
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { SECTION_TYPES, STORE_SECTION_TYPES, createSection, summarizeSection } from "../utils/appHomeSections";
import AppConfigTabs from "./AppConfigTabs";
import AppHomeSectionForm from "./AppHomeSectionForm";
import Loader from "./Loader";
import "./AppHomeEditor.css";

const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const toJsonText = (sections) => JSON.stringify({ sections }, null, 2);

const AppHomeEditor = () => {
  const baseUrl = getApiBaseUrl();
  const [sections, setSections] = useState([]);
  const [savedSnapshot, setSavedSnapshot] = useState("[]");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [products, setProducts] = useState([]);
  // Para contar lo que mostrarán las secciones de tienda (null si aún no existe).
  const [storeConfig, setStoreConfig] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [newType, setNewType] = useState("banner");
  const [view, setView] = useState("visual");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const productsById = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [products]
  );
  const isDirty = JSON.stringify(sections) !== savedSnapshot;

  const applyServerData = (data) => {
    const next = data?.sections || [];
    setSections(next);
    setSavedSnapshot(JSON.stringify(next));
    setUpdatedAt(data?.updatedAt || null);
    setJsonText(toJsonText(next));
  };

  const load = async () => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const [homeRes, productsRes, storeRes] = await Promise.all([
        axios.get(`${baseUrl}/api/app-home`, { headers: getAuthHeaders() }),
        axios.get(`${baseUrl}/api/products`, { headers: getAuthHeaders() }),
        // La versión pública basta para contar lo que mostrarán las secciones de
        // tienda, y no exige el módulo Configurar tienda (ni trae datos bancarios).
        axios
          .get(`${baseUrl}/api/store-config/public`)
          .catch((err) => (err.response?.status === 404 ? { data: null } : Promise.reject(err))),
      ]);
      applyServerData(homeRes.data);
      setProducts((productsRes.data?.items || []).sort((a, b) => a.name.localeCompare(b.name)));
      setStoreConfig(storeRes.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar el home de la app.");
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
      const response = await axios.put(`${baseUrl}/api/app-home`, { sections }, { headers: getAuthHeaders() });
      applyServerData(response.data);
      setMessage(response.data?.message || "Home de la app guardado.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar el home de la app.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateSection = (id, patch) =>
    setSections((current) => current.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const moveSection = (index, delta) =>
    setSections((current) => {
      const next = [...current];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  const removeSection = (section) => {
    if (!window.confirm(`¿Quitar la sección "${section.title || SECTION_TYPES[section.type]?.label || section.type}"?`)) return;
    setSections((current) => current.filter((s) => s.id !== section.id));
  };
  const addSection = () => {
    const section = createSection(newType);
    setSections((current) => [...current, section]);
    setExpandedId(section.id);
  };

  const switchView = (next) => {
    if (next === view) return;
    if (next === "json") {
      setJsonText(toJsonText(sections));
      setJsonError("");
    } else if (jsonText !== toJsonText(sections) && !window.confirm("El JSON tiene cambios sin aplicar. ¿Descartarlos?")) {
      return;
    }
    setView(next);
  };

  // Acepta { "sections": [...] } o el arreglo directo. Solo revisa la forma
  // general; el detalle lo valida el backend al guardar.
  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const next = Array.isArray(parsed) ? parsed : parsed?.sections;
      if (!Array.isArray(next)) throw new Error('Debe ser un arreglo de secciones o un objeto { "sections": [...] }.');
      next.forEach((s, i) => {
        if (!s || typeof s !== "object" || typeof s.type !== "string") throw new Error(`sections[${i}] necesita un "type".`);
      });
      setSections(next);
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

  if (isLoading) return <Loader />;

  return (
    <div className="app-home">
      <AppConfigTabs />
      <div className="app-home-header">
        <div>
          <h3>Home de la app</h3>
          <div className="app-home-hint">
            Secciones de la pantalla de inicio de la app móvil, en orden. Guardar publica los cambios: la app los ve la
            próxima vez que cargue el inicio, sin publicar una versión nueva.
            {updatedAt ? ` Última publicación: ${new Date(updatedAt).toLocaleString()}.` : " Aún no se ha publicado."}
          </div>
        </div>
        <div className="app-home-actions">
          <button type="button" className="btn-secondary" onClick={load} disabled={isSaving}>
            Recargar
          </button>
          <button type="button" className="app-home-save" onClick={save} disabled={isSaving || !isDirty || view === "json"}>
            {isSaving ? "Guardando..." : "Guardar y publicar"}
          </button>
        </div>
      </div>

      {isDirty ? <div className="app-home-dirty">Tienes cambios sin guardar.</div> : null}
      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

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
          {sections.length === 0 ? <div className="app-home-empty">El home no tiene secciones todavía.</div> : null}

          <ol className="app-home-list">
            {sections.map((section, index) => {
              const type = SECTION_TYPES[section.type];
              const isExpanded = expandedId === section.id;
              return (
                <li key={section.id || index} className={`app-home-section${section.visible === false ? " is-hidden" : ""}`}>
                  <div className="app-home-section-head">
                    <button
                      type="button"
                      className="app-home-section-toggle"
                      onClick={() => setExpandedId(isExpanded ? null : section.id)}
                      aria-expanded={isExpanded}
                    >
                      <i className={type?.icon || "fas fa-question"} aria-hidden="true" />
                      <span className="app-home-section-text">
                        <strong>{section.title || type?.label || section.type}</strong>
                        <small>
                          {type?.label || section.type} · {summarizeSection(section, productsById, storeConfig)}
                        </small>
                      </span>
                      <i className={`fas fa-chevron-${isExpanded ? "up" : "down"}`} aria-hidden="true" />
                    </button>
                    <div className="app-home-actions">
                      <label className="app-home-switch" title={section.visible === false ? "Oculta en la app" : "Visible en la app"}>
                        <input
                          type="checkbox"
                          checked={section.visible !== false}
                          onChange={(e) => updateSection(section.id, { visible: e.target.checked })}
                        />
                        {section.visible === false ? "Oculta" : "Visible"}
                      </label>
                      <button type="button" className="btn-secondary" disabled={index === 0} onClick={() => moveSection(index, -1)} title="Subir">
                        <i className="fas fa-arrow-up" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={index === sections.length - 1}
                        onClick={() => moveSection(index, 1)}
                        title="Bajar"
                      >
                        <i className="fas fa-arrow-down" aria-hidden="true" />
                      </button>
                      <button type="button" className="btn-danger" onClick={() => removeSection(section)} title="Quitar sección">
                        <i className="fas fa-trash" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <AppHomeSectionForm
                      section={section}
                      onChange={(patch) => updateSection(section.id, patch)}
                      products={products}
                      productsById={productsById}
                      categories={categories}
                      storeConfig={storeConfig}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div className="app-home-add">
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              <optgroup label="Contenido propio de la app">
                {Object.entries(SECTION_TYPES)
                  .filter(([value]) => !STORE_SECTION_TYPES[value])
                  .map(([value, type]) => (
                    <option key={value} value={value}>
                      {type.label}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Contenido de Configurar tienda">
                {Object.entries(STORE_SECTION_TYPES).map(([value, type]) => (
                  <option key={value} value={value}>
                    {type.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <button type="button" className="btn-secondary" onClick={addSection}>
              <i className="fas fa-plus" aria-hidden="true" /> Agregar sección
            </button>
          </div>
        </>
      ) : (
        <div className="app-home-json">
          <div className="app-home-hint">
            Estructura completa del home. Puedes pegar un JSON, <b>Aplicar</b> para cargarlo en el editor visual y
            luego <b>Guardar y publicar</b>. El servidor valida cada sección al guardar.
          </div>
          <textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} rows={24} />
          {jsonError ? <div className="auth-error">{jsonError}</div> : null}
          <div className="app-home-actions">
            <button type="button" className="btn-secondary" onClick={copyJson}>
              <i className="fas fa-copy" aria-hidden="true" /> Copiar
            </button>
            <button type="button" className="btn-secondary" onClick={() => setJsonText(toJsonText(sections))}>
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

export default AppHomeEditor;
