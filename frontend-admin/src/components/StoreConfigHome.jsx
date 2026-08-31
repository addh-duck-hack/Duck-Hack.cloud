import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import StoreConfigListEditor from "./StoreConfigListEditor";
import StoreConfigTabs from "./StoreConfigTabs";

const HERO_SLIDE_FIELDS = [
  { name: "title", label: "Título", type: "text", required: true, maxLength: 160, fullWidth: true },
  { name: "description", label: "Descripción", type: "textarea", maxLength: 300, fullWidth: true },
  { name: "isActive", label: "Activa", type: "boolean" },
];

const METRIC_SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "active_clients", label: "Automático — clientes activos" },
  { value: "active_containers", label: "Automático — contenedores activos" },
];

const METRIC_FIELDS = [
  { name: "label", label: "Etiqueta", type: "text", required: true, maxLength: 80 },
  { name: "source", label: "Origen", type: "select", options: METRIC_SOURCE_OPTIONS, fullWidth: true },
  {
    name: "value",
    label: "Valor (solo si el origen es Manual — si es automático, este texto se ignora)",
    type: "text",
    maxLength: 20,
    fullWidth: true,
  },
];

const COMMAND_FIELDS = [
  { name: "cmd", label: "Título corto (ej. Hosting a tu medida)", type: "text", required: true, maxLength: 80 },
  { name: "note", label: "Descripción (ej. Planes que se adaptan a cualquier tipo de negocio)", type: "text", maxLength: 160, fullWidth: true },
  { name: "icon", label: "Ícono FontAwesome (ej. fas fa-server)", type: "text", maxLength: 60 },
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

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  });

  const loadConfig = async () => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/store-config`, { headers: getAuthHeaders() });
      setHeroSlides(response.data?.heroSlides || []);
      setMetrics(response.data?.metrics || []);
      setCommands(response.data?.commands || []);
      setMessage("Configuración cargada.");
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
      <p>
        Slides del hero principal, las métricas destacadas y los pasos ("Qué puedes hacer con nosotros")
        de la página de inicio. Las métricas con origen automático (clientes activos / contenedores
        activos) recalculan su valor real en cada visita — lo que escribas en "Valor" para esas se ignora.
      </p>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <h4>Slides del hero</h4>
        <StoreConfigListEditor
          items={heroSlides}
          onChange={setHeroSlides}
          itemLabel={(item) => item.title}
          fields={HERO_SLIDE_FIELDS}
          createEmptyItem={() => ({ title: "", description: "", isActive: true })}
          addButtonLabel="+ Agregar slide"
        />

        <h4 style={{ marginTop: "2rem" }}>Métricas</h4>
        <StoreConfigListEditor
          items={metrics}
          onChange={setMetrics}
          itemLabel={(item) =>
            item.source && item.source !== "manual"
              ? `${item.label} (automático)`
              : `${item.value} — ${item.label}`
          }
          fields={METRIC_FIELDS}
          createEmptyItem={() => ({ source: "manual", value: "", label: "" })}
          addButtonLabel="+ Agregar métrica"
        />

        <h4 style={{ marginTop: "2rem" }}>Qué puedes hacer con nosotros</h4>
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
          <button type="button" onClick={loadConfig} disabled={isLoading} className="btn-secondary" style={{ width: "auto" }}>
            Recargar
          </button>
        </div>
      </form>
    </section>
  );
};

export default StoreConfigHome;
