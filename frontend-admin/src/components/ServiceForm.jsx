import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import MediaField from "./MediaField";
import { formatDuration } from "./ServiceList";

// Alta y edición de un servicio (packages/core-api/modules/services.js). El
// anticipo se guarda desde ya; se cobra cuando la tienda active los anticipos
// por SPEI (Fase 5 del Roadmap).

const initialState = {
  name: "",
  category: "",
  description: "",
  durationMin: "60",
  bufferMin: "0",
  price: "",
  priceFrom: false,
  image: "",
  bookableOnline: true,
  depositType: "none",
  depositValue: "",
  sortOrder: "0",
  isActive: true,
};

const ServiceForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [form, setForm] = useState(initialState);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    axios
      .get(`${baseUrl}/api/categories`, { headers: getAuthHeaders(), params: { kind: "service" } })
      .then((response) => setCategories(response.data?.items || []))
      .catch(() => setCategories([]));
    if (!isEditing) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const { data: s } = await axios.get(`${baseUrl}/api/services/${id}`, { headers: getAuthHeaders() });
        setForm({
          name: s.name || "",
          category: s.category?._id || s.category || "",
          description: s.description || "",
          durationMin: String(s.durationMin ?? 60),
          bufferMin: String(s.bufferMin ?? 0),
          price: String(s.price ?? ""),
          priceFrom: Boolean(s.priceFrom),
          image: s.image || "",
          bookableOnline: s.bookableOnline !== false,
          depositType: s.deposit?.type || "none",
          depositValue: s.deposit?.value ? String(s.deposit.value) : "",
          sortOrder: String(s.sortOrder ?? 0),
          isActive: s.isActive !== false,
        });
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar el servicio.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        category: form.category || null,
        description: form.description,
        durationMin: Number(form.durationMin),
        bufferMin: Number(form.bufferMin || 0),
        price: Number(form.price),
        priceFrom: form.priceFrom,
        image: form.image,
        bookableOnline: form.bookableOnline,
        deposit: { type: form.depositType, value: form.depositType === "none" ? 0 : Number(form.depositValue) },
        sortOrder: Number(form.sortOrder || 0),
        isActive: form.isActive,
      };
      const headers = { ...getAuthHeaders(), "Content-Type": "application/json" };
      if (isEditing) await axios.put(`${baseUrl}/api/services/${id}`, payload, { headers });
      else await axios.post(`${baseUrl}/api/services`, payload, { headers });
      navigate("/admin/services");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar el servicio.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <p>Cargando...</p>;

  const duration = Number(form.durationMin);

  return (
    <section style={{ maxWidth: 1300 }}>
      <h3>{isEditing ? `Editar servicio` : "Nuevo servicio"}</h3>

      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
          <label>
            Nombre
            <input type="text" name="name" value={form.name} onChange={handleChange} maxLength={120} required placeholder="Uñas acrílicas" />
          </label>
          <label>
            Categoría
            <select name="category" value={form.category} onChange={handleChange}>
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                  {c.isActive === false ? " (inactiva)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Descripción (opcional)
          <textarea name="description" value={form.description} onChange={handleChange} rows={3} maxLength={5000} />
          <small>Admite HTML básico (negritas, listas).</small>
        </label>

        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.75rem" }}>
          <label>
            Duración (minutos)
            <input type="number" name="durationMin" min="5" max="600" step="5" value={form.durationMin} onChange={handleChange} required />
            {duration > 0 ? <small>{formatDuration(duration)}</small> : null}
          </label>
          <label>
            Tiempo entre citas (min)
            <input type="number" name="bufferMin" min="0" max="240" step="5" value={form.bufferMin} onChange={handleChange} />
            <small>Limpieza o preparación después del servicio.</small>
          </label>
          <label>
            Precio (MXN)
            <input type="number" name="price" min="0" step="0.01" value={form.price} onChange={handleChange} required />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", alignSelf: "center" }}>
            <input type="checkbox" name="priceFrom" checked={form.priceFrom} onChange={handleChange} style={{ width: "auto" }} />
            Mostrar como "Desde $"
          </label>
        </div>

        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
          <label>
            Anticipo
            <select name="depositType" value={form.depositType} onChange={handleChange}>
              <option value="none">Sin anticipo</option>
              <option value="fixed">Monto fijo ($)</option>
              <option value="percent">Porcentaje del precio (%)</option>
            </select>
            <small>Se cobra cuando se activen los anticipos por SPEI.</small>
          </label>
          {form.depositType !== "none" ? (
            <label>
              {form.depositType === "percent" ? "Porcentaje" : "Monto (MXN)"}
              <input
                type="number"
                name="depositValue"
                min={form.depositType === "percent" ? 1 : 0.01}
                max={form.depositType === "percent" ? 100 : undefined}
                step={form.depositType === "percent" ? 1 : 0.01}
                value={form.depositValue}
                onChange={handleChange}
                required
              />
            </label>
          ) : (
            <span />
          )}
          <label>
            Orden
            <input type="number" name="sortOrder" min="0" step="1" value={form.sortOrder} onChange={handleChange} />
          </label>
        </div>

        <MediaField label="Imagen (opcional)" value={form.image} onChange={(image) => setForm((prev) => ({ ...prev, image }))} />

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
          <input type="checkbox" name="bookableOnline" checked={form.bookableOnline} onChange={handleChange} style={{ width: "auto" }} />
          Se puede agendar en línea (si no, solo por teléfono, en mostrador o WhatsApp)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} style={{ width: "auto" }} />
          Servicio activo
        </label>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/services")}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default ServiceForm;
