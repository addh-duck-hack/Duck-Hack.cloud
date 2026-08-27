import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const initialState = {
  businessName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  siteUrl: "",
  hostingProvider: "",
  serverLocation: "",
  notes: "",
  isActive: true,
};

const AgencyClientForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const mapApiToForm = (data) => ({
    businessName: data?.businessName || "",
    contactName: data?.contactName || "",
    contactEmail: data?.contactEmail || "",
    contactPhone: data?.contactPhone || "",
    siteUrl: data?.siteUrl || "",
    hostingProvider: data?.hostingProvider || "",
    serverLocation: data?.serverLocation || "",
    notes: data?.notes || "",
    isActive: typeof data?.isActive === "boolean" ? data.isActive : true,
  });

  useEffect(() => {
    if (!isEditing) return;

    const loadClient = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await axios.get(`${baseUrl}/api/agency-clients/${id}`, {
          headers: getAuthHeaders(),
        });
        setForm(mapApiToForm(response.data));
      } catch (err) {
        const msg = err.response?.data?.error?.message || "No fue posible cargar el cliente.";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    };

    loadClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const payload = { ...form };

      if (isEditing) {
        await axios.put(`${baseUrl}/api/agency-clients/${id}`, payload, {
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        });
        setMessage("Cliente actualizado correctamente.");
      } else {
        const response = await axios.post(`${baseUrl}/api/agency-clients`, payload, {
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        });
        setMessage("Cliente creado correctamente.");
        const newId = response.data?.client?._id;
        if (newId) {
          navigate(`/admin/agency-clients/${newId}`);
          return;
        }
      }
    } catch (err) {
      const msg = err.response?.data?.error?.message || "No fue posible guardar el cliente.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section style={{ maxWidth: 900 }}>
      <h3>{isEditing ? "Editar cliente de agencia" : "Nuevo cliente de agencia"}</h3>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label style={{ gridColumn: "1 / span 2" }}>
            Nombre del negocio
            <input name="businessName" value={form.businessName} onChange={handleChange} required />
          </label>

          <label>
            Nombre de contacto
            <input name="contactName" value={form.contactName} onChange={handleChange} />
          </label>

          <label>
            Email de contacto
            <input name="contactEmail" value={form.contactEmail} onChange={handleChange} />
          </label>

          <label>
            Teléfono de contacto
            <input name="contactPhone" value={form.contactPhone} onChange={handleChange} />
          </label>

          <label>
            URL del sitio
            <input name="siteUrl" value={form.siteUrl} onChange={handleChange} placeholder="https://..." />
          </label>

          <label>
            Proveedor de hosting
            <input name="hostingProvider" value={form.hostingProvider} onChange={handleChange} placeholder="VPS Docker - servidor 2" />
          </label>

          <label>
            Servidor / ubicación
            <input name="serverLocation" value={form.serverLocation} onChange={handleChange} />
          </label>

          <label style={{ gridColumn: "1 / span 2" }}>
            Notas
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={4} />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} />
            Cliente activo
          </label>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Guardando..." : "Guardar cliente"}
          </button>
        </div>
      </form>
    </section>
  );
};

export default AgencyClientForm;
