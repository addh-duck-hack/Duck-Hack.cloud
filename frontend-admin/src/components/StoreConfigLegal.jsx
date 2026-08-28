import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import StoreConfigTabs from "./StoreConfigTabs";

const initialState = {
  legalName: "",
  rfc: "",
  legalRepresentative: "",
  legalAddress: "",
  legalEmail: "",
  legalPhone: "",
};

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
  });

  const loadConfig = async () => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/store-config`, { headers: getAuthHeaders() });
      setForm(mapApiToForm(response.data));
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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.put(
        `${baseUrl}/api/store-config`,
        { legalIdentity: { ...form } },
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
        Datos usados en Aviso Legal y Aviso de Privacidad (razón social, RFC, representante, domicilio y
        contacto). El texto narrativo de esas páginas se mantiene fijo — solo estos datos son editables.
      </p>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
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
            <input type="tel" name="legalPhone" value={form.legalPhone} onChange={handleChange} maxLength={30} />
          </label>
          <label style={{ gridColumn: "1 / span 2" }}>
            Domicilio legal
            <textarea name="legalAddress" value={form.legalAddress} onChange={handleChange} maxLength={400} rows={3} />
          </label>
        </div>

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

export default StoreConfigLegal;
