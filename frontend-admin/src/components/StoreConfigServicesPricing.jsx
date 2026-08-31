import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import StoreConfigListEditor, { StringChipsEditor } from "./StoreConfigListEditor";
import StoreConfigTabs from "./StoreConfigTabs";

const SERVICE_FIELDS = [
  { name: "title", label: "Título", type: "text", required: true, maxLength: 100 },
  { name: "icon", label: "Icono", type: "icon", maxLength: 60 },
  { name: "route", label: "Ruta", type: "text", maxLength: 120 },
  { name: "description", label: "Descripción", type: "textarea", maxLength: 500, fullWidth: true },
  { name: "isActive", label: "Activo", type: "boolean" },
];

const PRICING_PLAN_FIELDS = [
  { name: "name", label: "Nombre del plan", type: "text", required: true, maxLength: 60 },
  { name: "description", label: "Descripción", type: "textarea", maxLength: 300, fullWidth: true },
  { name: "storage", label: "Almacenamiento", type: "text", maxLength: 40 },
  { name: "emailAccounts", label: "Cuentas de correo", type: "text", maxLength: 40 },
  { name: "bandwidth", label: "Ancho de banda", type: "text", maxLength: 40 },
  { name: "ssl", label: "SSL", type: "text", maxLength: 60 },
  { name: "originalPrice", label: "Precio original (MXN)", type: "number" },
  { name: "price", label: "Precio (MXN, vacío = bajo cotización)", type: "number" },
  { name: "discountPercent", label: "Descuento (%)", type: "number" },
  { name: "featured", label: "Destacado", type: "boolean" },
  { name: "extraFeaturesTitle", label: "Título de features extra", type: "text", maxLength: 120, fullWidth: true },
  { name: "extraFeatures", label: "Features extra", type: "stringList" },
  { name: "isActive", label: "Activo", type: "boolean" },
];

const FAQ_FIELDS = [
  { name: "q", label: "Pregunta", type: "text", required: true, maxLength: 200, fullWidth: true },
  { name: "a", label: "Respuesta", type: "textarea", required: true, maxLength: 1000, fullWidth: true },
  { name: "isActive", label: "Activa", type: "boolean" },
];

const StoreConfigServicesPricing = () => {
  const [services, setServices] = useState([]);
  const [pricingPlans, setPricingPlans] = useState([]);
  const [commonPlanChecks, setCommonPlanChecks] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadConfig = async () => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/store-config`, { headers: getAuthHeaders() });
      setServices(response.data?.services || []);
      setPricingPlans(response.data?.pricingPlans || []);
      setCommonPlanChecks(response.data?.commonPlanChecks || []);
      setFaqs(response.data?.faqs || []);
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
        { services, pricingPlans, commonPlanChecks, faqs },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      const saved = response.data?.storeConfig || {};
      setServices(saved.services || services);
      setPricingPlans(saved.pricingPlans || pricingPlans);
      setCommonPlanChecks(saved.commonPlanChecks || commonPlanChecks);
      setFaqs(saved.faqs || faqs);
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
      <h3>Servicios y precios</h3>
      <p>Servicios ofrecidos, planes de hosting y preguntas frecuentes.</p>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <h4>Servicios</h4>
        <StoreConfigListEditor
          items={services}
          onChange={setServices}
          itemLabel={(item) => item.title}
          fields={SERVICE_FIELDS}
          createEmptyItem={() => ({ title: "", icon: "", route: "", description: "", isActive: true })}
          addButtonLabel="+ Agregar servicio"
        />

        <h4 style={{ marginTop: "2rem" }}>Planes de precio</h4>
        <StoreConfigListEditor
          items={pricingPlans}
          onChange={setPricingPlans}
          itemLabel={(item) => item.name}
          fields={PRICING_PLAN_FIELDS}
          createEmptyItem={() => ({
            name: "",
            description: "",
            storage: "",
            emailAccounts: "",
            bandwidth: "",
            ssl: "",
            originalPrice: null,
            price: null,
            discountPercent: null,
            featured: false,
            extraFeaturesTitle: "",
            extraFeatures: [],
            isActive: true,
          })}
          addButtonLabel="+ Agregar plan"
        />

        <h4 style={{ marginTop: "2rem" }}>Beneficios comunes a todos los planes</h4>
        <StringChipsEditor values={commonPlanChecks} onChange={setCommonPlanChecks} />

        <h4 style={{ marginTop: "2rem" }}>Preguntas frecuentes</h4>
        <StoreConfigListEditor
          items={faqs}
          onChange={setFaqs}
          itemLabel={(item) => item.q}
          fields={FAQ_FIELDS}
          createEmptyItem={() => ({ q: "", a: "", isActive: true })}
          addButtonLabel="+ Agregar pregunta"
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

export default StoreConfigServicesPricing;
