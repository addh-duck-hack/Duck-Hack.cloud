import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import ImageUploadField from "./ImageUploadField";
import StoreConfigTabs from "./StoreConfigTabs";

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
  socialLinks: {
    whatsapp: "",
    instagram: "",
    facebook: "",
    threads: "",
  },
  isActive: true,
};

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

// Input de color con un swatch de vista previa junto al hex.
const ColorField = ({ label, name, value, placeholder, onChange }) => {
  const swatchColor = HEX_COLOR_REGEX.test(value) ? value : "transparent";
  return (
    <label>
      {label}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            minWidth: 34,
            borderRadius: 6,
            border: "1px solid var(--input-border-color)",
            background: swatchColor,
            marginBottom: "20px",
          }}
        />
        <input type="text" name={name} value={value} onChange={onChange} placeholder={placeholder} />
      </div>
    </label>
  );
};

const StoreConfigManager = () => {
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
    socialLinks: {
      whatsapp: data?.socialLinks?.whatsapp || "",
      instagram: data?.socialLinks?.instagram || "",
      facebook: data?.socialLinks?.facebook || "",
      threads: data?.socialLinks?.threads || "",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    if (name.startsWith("theme.") || name.startsWith("socialLinks.")) {
      const [section, key] = name.split(".");
      setForm((prev) => ({
        ...prev,
        [section]: {
          ...prev[section],
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

  const handleLogoChange = (imagePath) => {
    setForm((prev) => ({ ...prev, logoUrl: imagePath }));
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
        socialLinks: { ...form.socialLinks },
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

  // Esta vista es solo el formulario (2 columnas) — se le da un tope generoso
  // en vez de dejarlo sin límite, para que los campos de texto no terminen
  // absurdamente anchos en una pantalla grande.
  return (
    <section style={{ maxWidth: 1300 }}>
      <StoreConfigTabs />
      <h3>Configuración de tienda</h3>
      <p>
        Datos base y tema visual de esta instancia. El storefront (frontend-user) ya consume el logo, contacto,
        redes sociales y las fuentes/color de acento del tema. <strong>Nota:</strong> los colores primario y
        secundario todavía no se aplican al sitio público (requieren validar contraste antes de habilitarlos).
      </p>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <h4>Datos generales</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Nombre de tienda
            <input type="text" name="storeName" value={form.storeName} onChange={handleChange} required />
          </label>

          <label>
            Slug de tienda
            <input type="text" name="storeSlug" value={form.storeSlug} onChange={handleChange} required />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} style={{ width: "auto", margin: 0 }} />
            Tienda activa
          </label>
        </div>

        <h4 style={{ marginTop: "2rem" }}>Contacto</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Email de contacto
            <input type="email" name="contactEmail" value={form.contactEmail} onChange={handleChange} />
          </label>

          <label>
            Teléfono de contacto
            <input type="tel" name="contactPhone" value={form.contactPhone} onChange={handleChange} />
          </label>
        </div>

        <h4 style={{ marginTop: "2rem" }}>Marca</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div style={{ gridColumn: "1 / span 2" }}>
            <ImageUploadField label="Logo" value={form.logoUrl} onChange={handleLogoChange} previewBaseUrl={baseUrl} />
          </div>

          <ColorField
            label="Color primario"
            name="theme.primaryColor"
            value={form.theme.primaryColor}
            placeholder="#0B1F3A"
            onChange={handleChange}
          />
          <ColorField
            label="Color secundario"
            name="theme.secondaryColor"
            value={form.theme.secondaryColor}
            placeholder="#F2F5F9"
            onChange={handleChange}
          />
          <ColorField
            label="Color acento"
            name="theme.accentColor"
            value={form.theme.accentColor}
            placeholder="#FF6B00"
            onChange={handleChange}
          />

          <label>
            Fuente heading
            <input type="text" name="theme.fontFamilyHeading" value={form.theme.fontFamilyHeading} onChange={handleChange} />
          </label>

          <label>
            Fuente body
            <input type="text" name="theme.fontFamilyBody" value={form.theme.fontFamilyBody} onChange={handleChange} />
          </label>
        </div>

        <h4 style={{ marginTop: "2rem" }}>Redes sociales</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            WhatsApp (link completo)
            <input
              type="url"
              name="socialLinks.whatsapp"
              value={form.socialLinks.whatsapp}
              onChange={handleChange}
              placeholder="https://wa.me/..."
            />
          </label>
          <label>
            Instagram
            <input
              type="url"
              name="socialLinks.instagram"
              value={form.socialLinks.instagram}
              onChange={handleChange}
              placeholder="https://instagram.com/..."
            />
          </label>
          <label>
            Facebook
            <input
              type="url"
              name="socialLinks.facebook"
              value={form.socialLinks.facebook}
              onChange={handleChange}
              placeholder="https://facebook.com/..."
            />
          </label>
          <label>
            Threads
            <input
              type="url"
              name="socialLinks.threads"
              value={form.socialLinks.threads}
              onChange={handleChange}
              placeholder="https://threads.com/@..."
            />
          </label>
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
          <button type="submit" disabled={isLoading} style={{ width: "auto" }}>
            {isLoading ? "Guardando..." : "Guardar configuración"}
          </button>
          <button type="button" onClick={loadConfig} disabled={isLoading} className="btn-secondary" style={{ width: "auto" }}>
            Recargar
          </button>
        </div>
      </form>
    </section>
  );
};

export default StoreConfigManager;
