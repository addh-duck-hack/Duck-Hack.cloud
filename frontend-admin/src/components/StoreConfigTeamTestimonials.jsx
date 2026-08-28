import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import StoreConfigListEditor from "./StoreConfigListEditor";
import StoreConfigTabs from "./StoreConfigTabs";

const TEAM_MEMBER_FIELDS = [
  { name: "name", label: "Nombre", type: "text", required: true, maxLength: 100 },
  { name: "role", label: "Rol / puesto", type: "text", maxLength: 160 },
  { name: "bio", label: "Bio", type: "textarea", maxLength: 500, fullWidth: true },
  { name: "email", label: "Email", type: "email", maxLength: 160 },
  { name: "phone", label: "Teléfono", type: "tel", maxLength: 30 },
  { name: "photoUrl", label: "Foto", type: "image", fullWidth: true },
  { name: "isActive", label: "Activo", type: "boolean" },
];

const TESTIMONIAL_FIELDS = [
  { name: "name", label: "Nombre del cliente", type: "text", required: true, maxLength: 120 },
  { name: "rubro", label: "Rubro", type: "text", maxLength: 120 },
  { name: "description", label: "Descripción", type: "textarea", maxLength: 500, fullWidth: true },
  { name: "url", label: "URL del sitio", type: "url", maxLength: 300 },
  { name: "photoUrl", label: "Captura de pantalla", type: "image", fullWidth: true },
  { name: "isActive", label: "Activo", type: "boolean" },
];

const StoreConfigTeamTestimonials = () => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [testimonials, setTestimonials] = useState([]);
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
      setTeamMembers(response.data?.teamMembers || []);
      setTestimonials(response.data?.testimonials || []);
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
        { teamMembers, testimonials },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      const saved = response.data?.storeConfig || {};
      setTeamMembers(saved.teamMembers || teamMembers);
      setTestimonials(saved.testimonials || testimonials);
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
      <h3>Equipo y testimonios</h3>
      <p>Colaboradores mostrados en /nosotros y clientes destacados en /clientes.</p>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <h4>Equipo</h4>
        <StoreConfigListEditor
          items={teamMembers}
          onChange={setTeamMembers}
          itemLabel={(item) => item.name}
          fields={TEAM_MEMBER_FIELDS}
          createEmptyItem={() => ({ name: "", role: "", bio: "", email: "", phone: "", photoUrl: "", isActive: true })}
          addButtonLabel="+ Agregar colaborador"
        />

        <h4 style={{ marginTop: "2rem" }}>Testimonios / clientes</h4>
        <StoreConfigListEditor
          items={testimonials}
          onChange={setTestimonials}
          itemLabel={(item) => item.name}
          fields={TESTIMONIAL_FIELDS}
          createEmptyItem={() => ({ name: "", rubro: "", description: "", url: "", photoUrl: "", isActive: true })}
          addButtonLabel="+ Agregar testimonio"
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

export default StoreConfigTeamTestimonials;
