import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import ProductImageGallery from "./ProductImageGallery";

const initialState = {
  name: "",
  sku: "",
  description: "",
  price: "",
  compareAtPrice: "",
  category: "",
  images: [],
  isActive: true,
};

const ProductForm = () => {
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
    const loadProduct = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await axios.get(`${baseUrl}/api/products/${id}`, { headers: getAuthHeaders() });
        const p = response.data || {};
        setForm({
          name: p.name || "",
          sku: p.sku || "",
          description: p.description || "",
          price: p.price !== undefined ? String(p.price) : "",
          compareAtPrice: p.compareAtPrice !== undefined && p.compareAtPrice !== null ? String(p.compareAtPrice) : "",
          category: p.category || "",
          images: p.images || [],
          isActive: p.isActive !== false,
        });
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar el producto.");
      } finally {
        setIsLoading(false);
      }
    };
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleImagesChange = (images) => {
    setForm((prev) => ({ ...prev, images }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        description: form.description,
        price: Number(form.price),
        compareAtPrice: form.compareAtPrice === "" ? undefined : Number(form.compareAtPrice),
        category: form.category,
        images: form.images,
        isActive: form.isActive,
      };

      if (isEditing) {
        await axios.put(`${baseUrl}/api/products/${id}`, payload, {
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        });
      } else {
        await axios.post(`${baseUrl}/api/products`, payload, {
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        });
      }
      navigate("/admin/products");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar el producto.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <p>Cargando...</p>;

  return (
    <section>
      <h3>{isEditing ? "Editar producto" : "Nuevo producto"}</h3>

      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: 600, margin: 0 }}>
        <label>
          Nombre
          <input type="text" name="name" value={form.name} onChange={handleChange} required />
        </label>

        <label>
          SKU
          <input type="text" name="sku" value={form.sku} onChange={handleChange} required />
        </label>

        <label>
          Descripción
          <textarea name="description" value={form.description} onChange={handleChange} rows={3} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Precio (MXN)
            <input type="number" name="price" min="0" step="0.01" value={form.price} onChange={handleChange} required />
          </label>
          <label>
            Precio comparativo (opcional)
            <input type="number" name="compareAtPrice" min="0" step="0.01" value={form.compareAtPrice} onChange={handleChange} />
          </label>
        </div>

        <label>
          Categoría (opcional)
          <input type="text" name="category" value={form.category} onChange={handleChange} />
        </label>

        <ProductImageGallery value={form.images} onChange={handleImagesChange} />

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
          <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} style={{ width: "auto" }} />
          Producto activo
        </label>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/products")}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default ProductForm;
