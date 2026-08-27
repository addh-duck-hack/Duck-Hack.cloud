import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { HOSTING_PLANS, HOSTING_PLAN_IDS, formatMxn } from "../utils/hostingPlans";

const initialState = {
  businessName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  siteUrl: "",
  hostingPlan: "",
  hostingMonthlyCost: "",
  dockerContainers: [],
  domain: "",
  domainExpiresAt: "",
  billingName: "",
  billingRfc: "",
  billingAddress: "",
  billingEmail: "",
  notes: "",
  isActive: true,
};

const AgencyClientForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [form, setForm] = useState(initialState);
  const [newContainerName, setNewContainerName] = useState("");
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
    hostingPlan: data?.hostingPlan || "",
    hostingMonthlyCost: typeof data?.hostingMonthlyCost === "number" ? String(data.hostingMonthlyCost) : "",
    dockerContainers: Array.isArray(data?.dockerContainers) ? data.dockerContainers : [],
    domain: data?.domain || "",
    domainExpiresAt: data?.domainExpiresAt ? data.domainExpiresAt.slice(0, 10) : "",
    billingName: data?.billingName || "",
    billingRfc: data?.billingRfc || "",
    billingAddress: data?.billingAddress || "",
    billingEmail: data?.billingEmail || "",
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

  const addContainer = () => {
    const name = newContainerName.trim();
    if (!name || form.dockerContainers.includes(name)) return;
    setForm((prev) => ({ ...prev, dockerContainers: [...prev.dockerContainers, name] }));
    setNewContainerName("");
  };

  const removeContainer = (name) => {
    setForm((prev) => ({ ...prev, dockerContainers: prev.dockerContainers.filter((c) => c !== name) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const payload = { ...form };
      if (payload.hostingPlan === "enterprise") {
        payload.hostingMonthlyCost = Number(payload.hostingMonthlyCost);
      } else {
        delete payload.hostingMonthlyCost;
      }

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
      <div style={{ marginBottom: "1rem" }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate(isEditing ? `/admin/agency-clients/${id}` : "/admin/agency-clients")}
          style={{ width: "auto" }}
        >
          ← {isEditing ? "Volver a la ficha" : "Volver a la cuadrícula"}
        </button>
      </div>

      <h3>{isEditing ? "Editar cliente de agencia" : "Nuevo cliente de agencia"}</h3>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <h4>Datos generales</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label style={{ gridColumn: "1 / span 2" }}>
            Nombre del negocio
            <input type="text" name="businessName" value={form.businessName} onChange={handleChange} required />
          </label>

          <label>
            Nombre de contacto
            <input type="text" name="contactName" value={form.contactName} onChange={handleChange} />
          </label>

          <label>
            Email de contacto
            <input type="email" name="contactEmail" value={form.contactEmail} onChange={handleChange} />
          </label>

          <label>
            Teléfono de contacto
            <input type="tel" name="contactPhone" value={form.contactPhone} onChange={handleChange} />
          </label>

          <label>
            URL del sitio
            <input type="url" name="siteUrl" value={form.siteUrl} onChange={handleChange} placeholder="https://..." />
          </label>
        </div>

        <h4 style={{ marginTop: "2rem" }}>Hosting</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Plan de hosting contratado
            <select name="hostingPlan" value={form.hostingPlan} onChange={handleChange}>
              <option value="">Selecciona un plan</option>
              {HOSTING_PLAN_IDS.map((planId) => (
                <option key={planId} value={planId}>
                  {HOSTING_PLANS[planId].label}
                  {HOSTING_PLANS[planId].price !== null ? ` — ${formatMxn(HOSTING_PLANS[planId].price)}/mes` : " — bajo cotización"}
                </option>
              ))}
            </select>
          </label>

          {form.hostingPlan === "enterprise" ? (
            <label>
              Costo mensual acordado (Enterprise)
              <input
                type="number"
                name="hostingMonthlyCost"
                value={form.hostingMonthlyCost}
                onChange={handleChange}
                min="0"
                step="0.01"
                placeholder="0.00"
                required
              />
            </label>
          ) : (
            <label>
              Costo mensual
              <input type="text" value={form.hostingPlan ? `${formatMxn(HOSTING_PLANS[form.hostingPlan].price)}/mes` : "—"} disabled />
            </label>
          )}

          <label>
            Dominio del sitio
            <input type="text" name="domain" value={form.domain} onChange={handleChange} placeholder="cliente.com" />
          </label>

          <label>
            Vencimiento del dominio
            <input type="date" name="domainExpiresAt" value={form.domainExpiresAt} onChange={handleChange} />
          </label>

          <label style={{ gridColumn: "1 / span 2" }}>
            Contenedores Docker
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={newContainerName}
                onChange={(e) => setNewContainerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addContainer();
                  }
                }}
                placeholder="duck-hack.frontend-user (nombre exacto en Portainer)"
                style={{ marginBottom: 0 }}
              />
              <button type="button" onClick={addContainer} className="btn-secondary" style={{ width: "auto" }}>
                Agregar
              </button>
            </div>
          </label>
          {form.dockerContainers.length > 0 ? (
            <div style={{ gridColumn: "1 / span 2", display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "-0.5rem", marginBottom: "0.75rem" }}>
              {form.dockerContainers.map((name) => (
                <span key={name} className="badge badge-green" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  {name}
                  <button
                    type="button"
                    onClick={() => removeContainer(name)}
                    style={{ all: "unset", cursor: "pointer", width: "auto", lineHeight: 1 }}
                    aria-label={`Quitar ${name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <h4 style={{ marginTop: "2rem" }}>Datos de facturación del cliente (opcional)</h4>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem" }}>Si se llenan, aparecen en la sección "Facturar a" del PDF; si no, se usa el nombre del negocio.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Razón social / nombre de facturación
            <input type="text" name="billingName" value={form.billingName} onChange={handleChange} />
          </label>
          <label>
            RFC
            <input type="text" name="billingRfc" value={form.billingRfc} onChange={handleChange} />
          </label>
          <label style={{ gridColumn: "1 / span 2" }}>
            Dirección de facturación
            <input type="text" name="billingAddress" value={form.billingAddress} onChange={handleChange} />
          </label>
          <label>
            Email de facturación
            <input type="email" name="billingEmail" value={form.billingEmail} onChange={handleChange} />
          </label>
        </div>

        <h4 style={{ marginTop: "2rem" }}>Otros</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label style={{ gridColumn: "1 / span 2" }}>
            Notas
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={4} />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} style={{ width: "auto", margin: 0 }} />
            Cliente activo
          </label>
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <button type="submit" disabled={isLoading} style={{ width: "auto" }}>
            {isLoading ? "Guardando..." : "Guardar cliente"}
          </button>
        </div>
      </form>
    </section>
  );
};

export default AgencyClientForm;
