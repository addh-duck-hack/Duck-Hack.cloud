import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import StoreConfigTabs from "./StoreConfigTabs";
import PhoneInput from "./PhoneInput";
import Alert from "./Alert";

const initialState = {
  legalName: "",
  rfc: "",
  legalRepresentative: "",
  legalAddress: "",
  legalEmail: "",
  legalPhone: "",
  privacyNotice: "",
  legalNotice: "",
  returnsPolicy: "",
};

// Textos de las páginas legales de la tienda, en HTML básico (StoreConfig
// .privacyNotice / legalNotice / returnsPolicy). `emptyHint`: qué pasa si se
// deja vacío.
const LEGAL_TEXTS = [
  {
    name: "privacyNotice",
    title: "Aviso de privacidad",
    emptyHint: "Vacío = la tienda muestra su aviso de privacidad por defecto, con los datos de la empresa de arriba.",
  },
  {
    name: "legalNotice",
    title: "Aviso legal",
    emptyHint: "Vacío = la tienda muestra su aviso legal por defecto, con los datos de la empresa de arriba.",
  },
  {
    name: "returnsPolicy",
    title: "Política de devoluciones",
    emptyHint: "Vacío = la tienda no muestra la página.",
  },
];
const LEGAL_TEXT_MAX = 50000;

const StoreConfigLegal = () => {
  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const mapApiToForm = (data) => ({
    legalName: data?.legalIdentity?.legalName || "",
    rfc: data?.legalIdentity?.rfc || "",
    legalRepresentative: data?.legalIdentity?.legalRepresentative || "",
    legalAddress: data?.legalIdentity?.legalAddress || "",
    legalEmail: data?.legalIdentity?.legalEmail || "",
    legalPhone: data?.legalIdentity?.legalPhone || "",
    privacyNotice: data?.privacyNotice || "",
    legalNotice: data?.legalNotice || "",
    returnsPolicy: data?.returnsPolicy || "",
  });

  // Al entrar, sin aviso; con "Recargar" (acción de la persona), sí.
  const loadConfig = async ({ announce = false } = {}) => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/store-config`, { headers: getAuthHeaders() });
      setForm(mapApiToForm(response.data));
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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const { privacyNotice, legalNotice, returnsPolicy, ...legalIdentity } = form;
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.put(
        `${baseUrl}/api/store-config`,
        { legalIdentity: { ...legalIdentity }, privacyNotice, legalNotice, returnsPolicy },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setForm(mapApiToForm(response.data?.storeConfig));
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
      <h3>Identidad legal</h3>
      <p>
        Datos de la empresa (razón social, RFC, representante, domicilio y contacto) y el texto de las páginas legales
        de la tienda: Aviso de privacidad, Aviso legal y Política de devoluciones.
      </p>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <h4 style={{ marginTop: 0 }}>Datos de la empresa</h4>
        <p style={{ marginTop: 0 }}>Se usan en los avisos legales por defecto de la tienda.</p>
        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Razón social / nombre comercial
            <input type="text" name="legalName" value={form.legalName} onChange={handleChange} maxLength={160} />
          </label>
          <label>
            RFC
            <input type="text" name="rfc" value={form.rfc} onChange={handleChange} maxLength={20} />
          </label>
          <label>
            Representante legal
            <input
              type="text"
              name="legalRepresentative"
              value={form.legalRepresentative}
              onChange={handleChange}
              maxLength={160}
            />
          </label>
          <label>
            Email de contacto legal
            <input type="email" name="legalEmail" value={form.legalEmail} onChange={handleChange} maxLength={160} />
          </label>
          <label>
            Teléfono de contacto legal
            <PhoneInput name="legalPhone" value={form.legalPhone} onChange={handleChange} />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Domicilio legal
            <textarea name="legalAddress" value={form.legalAddress} onChange={handleChange} maxLength={400} rows={3} />
          </label>
        </div>

        {LEGAL_TEXTS.map(({ name, title, emptyHint }) => (
          <React.Fragment key={name}>
            <h4 style={{ marginTop: "2rem" }}>{title}</h4>
            <label>
              Texto de la página (admite HTML básico: &lt;h2&gt;, &lt;p&gt;, &lt;b&gt;, &lt;ul&gt;, &lt;a&gt;…)
              <textarea name={name} value={form[name]} onChange={handleChange} maxLength={LEGAL_TEXT_MAX} rows={12} />
              <small>
                {emptyHint} {form[name].length.toLocaleString("es-MX")} / {LEGAL_TEXT_MAX.toLocaleString("es-MX")} caracteres.
              </small>
            </label>
          </React.Fragment>
        ))}

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

export default StoreConfigLegal;
