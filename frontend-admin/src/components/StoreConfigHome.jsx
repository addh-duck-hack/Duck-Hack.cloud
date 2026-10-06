import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import StoreConfigListEditor from "./StoreConfigListEditor";
import StoreConfigTabs from "./StoreConfigTabs";
import { ROLES } from "../utils/roles";
import Alert from "./Alert";

const HERO_MEDIA_TYPE_OPTIONS = [
  { value: "none", label: "Ninguno" },
  { value: "image", label: "Imagen" },
  { value: "gif", label: "GIF animado" },
  { value: "video_direct", label: "Video — enlace directo (.mp4/.webm)" },
  { value: "video_youtube", label: "Video — enlace de YouTube" },
];

const HERO_SLIDE_FIELDS = [
  { name: "title", label: "Título", type: "text", required: true, maxLength: 160, fullWidth: true },
  { name: "description", label: "Descripción", type: "textarea", maxLength: 300, fullWidth: true },
  { name: "isActive", label: "Activa", type: "boolean" },
  { name: "mediaType", label: "Tipo de contenido del header", type: "select", options: HERO_MEDIA_TYPE_OPTIONS, fullWidth: true },
  {
    name: "mediaPath",
    label: "Imagen o GIF (usado si el tipo es Imagen o GIF animado)",
    type: "image",
    mediaKinds: ["image", "gif"],
    fullWidth: true,
  },
  {
    name: "mediaUrl",
    label: "URL de video (usado si el tipo es enlace directo o de YouTube)",
    type: "url",
    // Un video directo también se puede elegir/subir desde Medios.
    mediaKinds: ["video"],
    maxLength: 500,
    fullWidth: true,
  },
];

// Los orígenes automáticos solo tienen datos en la instancia de Duck-Hack
// (clientes de la agencia y contenedores de Portainer, ver
// backend/server.js#resolveLiveMetricSources): una tienda no los ve, salvo
// que una métrica guardada ya use uno (para no perderlo al editar).
const AUTO_METRIC_SOURCES = [
  { value: "active_clients", label: "Automático — clientes de la agencia (solo Duck-Hack)" },
  { value: "active_containers", label: "Automático — contenedores del servidor (solo Duck-Hack)" },
];

const metricFieldsFor = (showAutoSources) => [
  { name: "label", label: "Etiqueta (ej. Clientas felices)", type: "text", required: true, maxLength: 80 },
  ...(showAutoSources
    ? [{ name: "source", label: "Origen", type: "select", options: [{ value: "manual", label: "Manual" }, ...AUTO_METRIC_SOURCES], fullWidth: true }]
    : []),
  {
    name: "value",
    label: showAutoSources ? "Valor (solo si el origen es Manual — si es automático, este texto se ignora)" : "Valor (ej. +500)",
    type: "text",
    maxLength: 20,
    fullWidth: true,
  },
];

const COMMAND_FIELDS = [
  { name: "cmd", label: "Título corto (ej. Agenda en línea)", type: "text", required: true, maxLength: 80 },
  { name: "note", label: "Descripción (ej. Elige servicio, día y hora en dos minutos)", type: "text", maxLength: 160, fullWidth: true },
  { name: "icon", label: "Ícono", type: "icon", maxLength: 60 },
  { name: "isActive", label: "Activo", type: "boolean" },
];

const StoreConfigHome = () => {
  const [heroSlides, setHeroSlides] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [commands, setCommands] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const showAutoSources =
    localStorage.getItem("role") === ROLES.SUPER_ADMIN || metrics.some((m) => m.source && m.source !== "manual");

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  });

  // Al entrar, sin aviso; con "Recargar" (acción de la persona), sí.
  const loadConfig = async ({ announce = false } = {}) => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/store-config`, { headers: getAuthHeaders() });
      setHeroSlides(response.data?.heroSlides || []);
      setMetrics(response.data?.metrics || []);
      setCommands(response.data?.commands || []);
      if (announce) setMessage("Se recargó la configuración guardada.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar la configuración.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.put(
        `${baseUrl}/api/store-config`,
        { heroSlides, metrics, commands },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setHeroSlides(response.data?.storeConfig?.heroSlides || heroSlides);
      setMetrics(response.data?.storeConfig?.metrics || metrics);
      setCommands(response.data?.storeConfig?.commands || commands);
      setMessage(response.data?.message || "Configuración guardada.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar la configuración.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section style={{ maxWidth: 1300 }}>
      <StoreConfigTabs />
      <h3>Home del sitio</h3>
      <p>Slides del encabezado principal, las cifras destacadas y los pasos ("cómo funciona") de la página de inicio.</p>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <h4>Slides del hero</h4>
        <StoreConfigListEditor
          items={heroSlides}
          onChange={setHeroSlides}
          itemLabel={(item) => item.title}
          fields={HERO_SLIDE_FIELDS}
          createEmptyItem={() => ({
            title: "",
            description: "",
            isActive: true,
            mediaType: "none",
            mediaPath: "",
            mediaUrl: "",
          })}
          addButtonLabel="+ Agregar slide"
        />

        <h4 style={{ marginTop: "2rem" }}>Cifras destacadas</h4>
        <StoreConfigListEditor
          items={metrics}
          onChange={setMetrics}
          itemLabel={(item) =>
            item.source && item.source !== "manual"
              ? `${item.label} (automático)`
              : `${item.value} — ${item.label}`
          }
          fields={metricFieldsFor(showAutoSources)}
          createEmptyItem={() => ({ source: "manual", value: "", label: "" })}
          addButtonLabel="+ Agregar cifra"
        />

        <h4 style={{ marginTop: "2rem" }}>Pasos / cómo funciona</h4>
        <StoreConfigListEditor
          items={commands}
          onChange={setCommands}
          itemLabel={(item) => item.cmd}
          fields={COMMAND_FIELDS}
          createEmptyItem={() => ({ cmd: "", note: "", icon: "", isActive: true })}
          addButtonLabel="+ Agregar paso"
        />

        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
          <button type="submit" disabled={isLoading} style={{ width: "auto" }}>
            {isLoading ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" onClick={() => loadConfig({ announce: true })} disabled={isLoading} className="btn-secondary" style={{ width: "auto" }}>
            Recargar
          </button>
        </div>
      </form>
    </section>
  );
};

export default StoreConfigHome;
