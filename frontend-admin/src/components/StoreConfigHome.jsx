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

const METRIC_FIELDS = [
  { name: "value", label: "Valor (ej. 99.9% o 24)", type: "text", required: true, maxLength: 20 },
  { name: "label", label: "Etiqueta", type: "text", required: true, maxLength: 80 },
];

const StoreConfigHome = () => {
  const [heroSlides, setHeroSlides] = useState([]);
  const [metrics, setMetrics] = useState([]);
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
        { heroSlides, metrics },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setHeroSlides(response.data?.storeConfig?.heroSlides || heroSlides);
      setMetrics(response.data?.storeConfig?.metrics || metrics);
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
      <p>Slides del hero principal y las métricas destacadas de la página de inicio.</p>

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
          itemLabel={(item) => `${item.value} — ${item.label}`}
          fields={METRIC_FIELDS}
          createEmptyItem={() => ({ value: "", label: "" })}
          addButtonLabel="+ Agregar métrica"
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
