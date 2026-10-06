import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import StoreConfigListEditor, { StringChipsEditor } from "./StoreConfigListEditor";
import StoreConfigTabs from "./StoreConfigTabs";
import Alert from "./Alert";

const SERVICE_FIELDS = [
  { name: "title", label: "Título", type: "text", required: true, maxLength: 100 },
  { name: "icon", label: "Icono", type: "icon", maxLength: 60 },
  { name: "route", label: "Enlace (opcional, ej. /agendar)", type: "text", maxLength: 120 },
  { name: "description", label: "Descripción", type: "textarea", maxLength: 500, fullWidth: true },
  { name: "isActive", label: "Activo", type: "boolean" },
];

const PRICING_PLAN_FIELDS = [
  { name: "name", label: "Nombre del plan", type: "text", required: true, maxLength: 60 },
  { name: "description", label: "Descripción", type: "textarea", maxLength: 300, fullWidth: true },
  {
    name: "features",
    label: "Características",
    type: "keyValueList",
    editorProps: {
      hint: "Lo que incluye el plan, en este orden. Ej.: Sesiones → 4 · Duración → 60 min · Envío → Gratis.",
      suggestions: ["Sesiones", "Duración", "Incluye", "Vigencia", "Productos", "Envío", "Entregas", "Soporte"],
      max: 20,
      valueMaxLength: 80,
      itemNoun: "característica",
      namePlaceholder: "Nombre (ej. Sesiones)",
      valuePlaceholder: "Valor (ej. 4)",
    },
  },
  { name: "originalPrice", label: "Precio original (MXN)", type: "number" },
  { name: "price", label: "Precio (MXN, vacío = bajo cotización)", type: "number" },
  { name: "discountPercent", label: "Descuento (%)", type: "number" },
  { name: "featured", label: "Destacado", type: "boolean" },
  { name: "extraFeaturesTitle", label: "Título de la lista adicional (opcional)", type: "text", maxLength: 120, fullWidth: true },
  { name: "extraFeatures", label: "Lista adicional", type: "stringList" },
  { name: "isActive", label: "Activo", type: "boolean" },
];

// Planes guardados antes de las características libres: los campos de hosting
// (storage/emailAccounts/bandwidth/ssl) se muestran como características para
// editarlos aquí; el backend hace la misma conversión al guardar.
const LEGACY_PLAN_FIELDS = [
  ["storage", "Almacenamiento"],
  ["emailAccounts", "Cuentas de correo"],
  ["bandwidth", "Ancho de banda"],
  ["ssl", "SSL"],
];

const normalizePlan = (plan) => {
  const { storage, emailAccounts, bandwidth, ssl, ...rest } = plan;
  const legacy = { storage, emailAccounts, bandwidth, ssl };
  const features = [...(plan.features || [])];
  const names = new Set(features.map((f) => String(f.name || "").toLowerCase()));
  LEGACY_PLAN_FIELDS.forEach(([field, label]) => {
    const value = String(legacy[field] || "").trim();
    if (value && !names.has(label.toLowerCase())) features.push({ name: label, value });
  });
  return { ...rest, features };
};

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

  // Al entrar, sin aviso; con "Recargar" (acción de la persona), sí.
  const loadConfig = async ({ announce = false } = {}) => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/store-config`, { headers: getAuthHeaders() });
      setServices(response.data?.services || []);
      setPricingPlans((response.data?.pricingPlans || []).map(normalizePlan));
      setCommonPlanChecks(response.data?.commonPlanChecks || []);
      setFaqs(response.data?.faqs || []);
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
        { services, pricingPlans, commonPlanChecks, faqs },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      const saved = response.data?.storeConfig || {};
      setServices(saved.services || services);
      setPricingPlans((saved.pricingPlans || pricingPlans).map(normalizePlan));
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
      <h3>Secciones, planes y FAQ</h3>
      <p>
        Contenido de las secciones del sitio: tarjetas de servicios, planes o paquetes con precio y preguntas
        frecuentes. Para servicios que se agendan (duración, precio, especialistas) usa el módulo Servicios.
      </p>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <h4>Tarjetas de servicios</h4>
        <StoreConfigListEditor
          items={services}
          onChange={setServices}
          itemLabel={(item) => item.title}
          fields={SERVICE_FIELDS}
          createEmptyItem={() => ({ title: "", icon: "", route: "", description: "", isActive: true })}
          addButtonLabel="+ Agregar tarjeta"
        />

        <h4 style={{ marginTop: "2rem" }}>Planes o paquetes</h4>
        <StoreConfigListEditor
          items={pricingPlans}
          onChange={setPricingPlans}
          itemLabel={(item) => item.name}
          fields={PRICING_PLAN_FIELDS}
          createEmptyItem={() => ({
            name: "",
            description: "",
            features: [],
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
          <button type="button" onClick={() => loadConfig({ announce: true })} disabled={isLoading} className="btn-secondary" style={{ width: "auto" }}>
            Recargar
          </button>
        </div>
      </form>
    </section>
  );
};

export default StoreConfigServicesPricing;
