import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import MediaField from "./MediaField";
import { CATEGORY_KINDS } from "../utils/categoryKinds";

const initialState = {
  name: "",
  slug: "",
  description: "",
  image: "",
  featured: false,
  sortOrder: "0",
  isActive: true,
};

// Alta y edición de categorías de productos o de servicios (`kind`, ver
// utils/categoryKinds.js). El kind se fija al crear; no cambia al editar.
const CategoryForm = ({ kind = "product" }) => {
  const { basePath } = CATEGORY_KINDS[kind];
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    if (!isEditing) return;
    const loadCategory = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await axios.get(`${baseUrl}/api/categories/${id}`, { headers: getAuthHeaders() });
        const c = response.data || {};
        setForm({
          name: c.name || "",
          slug: c.slug || "",
          description: c.description || "",
          image: c.image || "",
          featured: Boolean(c.featured),
          sortOrder: String(c.sortOrder ?? 0),
          isActive: c.isActive !== false,
        });
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar la categoría.");
      } finally {
        setIsLoading(false);
      }
    };
    loadCategory();
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
        description: form.description,
        image: form.image,
        featured: form.featured,
        sortOrder: Number(form.sortOrder || 0),
        isActive: form.isActive,
      };
      if (!isEditing) payload.kind = kind;
      // Vacío en el alta = el backend lo genera del nombre.
      if (form.slug.trim()) payload.slug = form.slug.trim();

      const headers = { ...getAuthHeaders(), "Content-Type": "application/json" };
      if (isEditing) {
        await axios.put(`${baseUrl}/api/categories/${id}`, payload, { headers });
      } else {
        await axios.post(`${baseUrl}/api/categories`, payload, { headers });
      }
      navigate(basePath);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar la categoría.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <p>Cargando...</p>;

  return (
    <section style={{ maxWidth: 1300 }}>
      <h3>
        {isEditing ? "Editar categoría" : "Nueva categoría"}
        {kind === "service" ? " de servicios" : ""}
      </h3>

      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <label>
          Nombre
          <input type="text" name="name" value={form.name} onChange={handleChange} maxLength={80} required />
        </label>

        <label>
          Slug {isEditing ? "" : "(opcional)"}
          <input
            type="text"
            name="slug"
            value={form.slug}
            onChange={handleChange}
            maxLength={80}
            placeholder={isEditing ? "" : "Se genera del nombre (ej. cafe-de-olla)"}
          />
          <small>
            Identificador en la dirección de la tienda y en el home de la app. Si lo cambias, revisa las secciones del home
            de la app que usan esta categoría.
          </small>
        </label>

        <label>
          Descripción (opcional)
          <textarea name="description" value={form.description} onChange={handleChange} rows={3} maxLength={500} />
        </label>

        <MediaField label="Imagen (opcional)" value={form.image} onChange={(image) => setForm((prev) => ({ ...prev, image }))} />

        <label style={{ marginTop: "0.75rem" }}>
          Orden
          <input type="number" name="sortOrder" min="0" step="1" value={form.sortOrder} onChange={handleChange} />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
          <input type="checkbox" name="featured" checked={form.featured} onChange={handleChange} style={{ width: "auto" }} />
          Destacada (se muestra en "categorías destacadas" de la tienda)
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} style={{ width: "auto" }} />
          Categoría activa
        </label>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate(basePath)}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default CategoryForm;
