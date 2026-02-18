import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const initialState = {
  storeName: "",
  storeSlug: "",
  contactEmail: "",
  contactPhone: "",
  logoUrl: "",
  theme: {
    primaryColor: "",
    secondaryColor: "",
    accentColor: "",
    fontFamilyHeading: "",
    fontFamilyBody: "",
  },
  isActive: true,
};

const StoreConfigManager = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const baseUrl = process.env.REACT_APP_HOST_SERVICES_URL;

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const mapApiToForm = (data) => ({
    storeName: data?.storeName || "",
    storeSlug: data?.storeSlug || "",
    contactEmail: data?.contactEmail || "",
    contactPhone: data?.contactPhone || "",
    logoUrl: data?.logoUrl || "",
    theme: {
      primaryColor: data?.theme?.primaryColor || "",
      secondaryColor: data?.theme?.secondaryColor || "",
      accentColor: data?.theme?.accentColor || "",
      fontFamilyHeading: data?.theme?.fontFamilyHeading || "",
      fontFamilyBody: data?.theme?.fontFamilyBody || "",
    },
    isActive: typeof data?.isActive === "boolean" ? data.isActive : true,
  });

  const loadConfig = async () => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/store-config`, {
        headers: getAuthHeaders(),
      });
      setForm(mapApiToForm(response.data));
      setMessage("Configuración cargada.");
    } catch (err) {
      const msg = err.response?.data?.error?.message || "No fue posible cargar la configuración.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    if (name.startsWith("theme.")) {
      const key = name.split(".")[1];
      setForm((prev) => ({
        ...prev,
        theme: {
          ...prev.theme,
          [key]: value,
        },
      }));
      return;
    }

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
      const payload = {
        storeName: form.storeName,
        storeSlug: form.storeSlug,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        logoUrl: form.logoUrl,
        isActive: form.isActive,
        theme: { ...form.theme },
      };

      const response = await axios.put(`${baseUrl}/api/store-config`, payload, {
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
      });

      setForm(mapApiToForm(response.data?.storeConfig || payload));
      setMessage(response.data?.message || "Configuración guardada.");
    } catch (err) {
      const msg = err.response?.data?.error?.message || "No fue posible guardar la configuración.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section style={{ marginTop: "2rem", textAlign: "left", maxWidth: 900 }}>
      <div style={{ marginBottom: "1rem" }}>
        <button type="button" onClick={() => navigate("/admin")}>
          Volver al panel
        </button>
      </div>
      <h3>Configuración de Tienda</h3>
      <p>Gestiona los datos base y el tema de la instancia.</p>

      {message ? <p style={{ color: "#256029" }}>{message}</p> : null}
      {error ? <p style={{ color: "#9d1c1c" }}>{error}</p> : null}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Nombre de tienda
            <input name="storeName" value={form.storeName} onChange={handleChange} required />
          </label>

          <label>
            Slug de tienda
            <input name="storeSlug" value={form.storeSlug} onChange={handleChange} required />
          </label>

          <label>
            Email de contacto
            <input name="contactEmail" value={form.contactEmail} onChange={handleChange} />
          </label>

          <label>
            Teléfono de contacto
            <input name="contactPhone" value={form.contactPhone} onChange={handleChange} />
          </label>

          <label style={{ gridColumn: "1 / span 2" }}>
            Logo URL
            <input name="logoUrl" value={form.logoUrl} onChange={handleChange} />
          </label>

          <label>
            Color primario
            <input name="theme.primaryColor" value={form.theme.primaryColor} onChange={handleChange} placeholder="#0B1F3A" />
          </label>

          <label>
            Color secundario
            <input name="theme.secondaryColor" value={form.theme.secondaryColor} onChange={handleChange} placeholder="#F2F5F9" />
          </label>

          <label>
            Color acento
            <input name="theme.accentColor" value={form.theme.accentColor} onChange={handleChange} placeholder="#FF6B00" />
          </label>

          <label>
            Fuente heading
            <input name="theme.fontFamilyHeading" value={form.theme.fontFamilyHeading} onChange={handleChange} />
          </label>

          <label>
            Fuente body
            <input name="theme.fontFamilyBody" value={form.theme.fontFamilyBody} onChange={handleChange} />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} />
            Tienda activa
          </label>
        </div>

        <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}>
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Guardando..." : "Guardar configuración"}
          </button>
          <button type="button" onClick={loadConfig} disabled={isLoading}>
            Recargar
          </button>
        </div>
      </form>
    </section>
  );
};

export default StoreConfigManager;
