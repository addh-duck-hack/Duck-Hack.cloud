import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import ProductImageGallery from "./ProductImageGallery";
import ProductAttributesEditor from "./ProductAttributesEditor";
import ProductVariantsEditor from "./ProductVariantsEditor";
import Alert from "./Alert";

const initialState = {
  name: "",
  sku: "",
  description: "",
  price: "",
  compareAtPrice: "",
  category: "",
  images: [],
  attributes: [],
  options: [],
  variants: [],
  featured: false,
  sortOrder: "0",
  isActive: true,
};

const priceOrNull = (value) => (value === "" || value === null || value === undefined ? null : Number(value));

// Recorta valores de opciones (se editan "crudos", ver ProductVariantsEditor)
// y convierte los precios vacíos de las variantes en null (= heredan).
const toVariantsPayload = (options, variants) => ({
  options: options.map((o) => ({ name: o.name.trim(), values: [...new Set(o.values.map((v) => v.trim()).filter(Boolean))] })),
  variants: variants.map((v) => ({
    ...(v._id ? { _id: v._id } : {}),
    sku: v.sku.trim(),
    optionValues: v.optionValues,
    price: priceOrNull(v.price),
    compareAtPrice: v.price === "" ? null : priceOrNull(v.compareAtPrice),
    image: v.image || "",
    isActive: v.isActive !== false,
  })),
});

const ProductForm = () => {
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
    const loadCategories = async () => {
      try {
        const response = await axios.get(`${baseUrl}/api/categories`, { headers: getAuthHeaders() });
        setCategories(response.data?.items || []);
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar las categorías.");
      }
    };
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          category: p.category?._id || p.category || "",
          images: p.images || [],
          attributes: (p.attributes || []).map((a) => ({ name: a.name || "", value: a.value || "" })),
          options: (p.options || []).map((o) => ({ name: o.name || "", values: o.values || [] })),
          variants: (p.variants || []).map((v) => ({
            _id: v._id,
            sku: v.sku || "",
            optionValues: v.optionValues || [],
            price: v.price !== undefined && v.price !== null ? String(v.price) : "",
            compareAtPrice: v.compareAtPrice !== undefined && v.compareAtPrice !== null ? String(v.compareAtPrice) : "",
            image: v.image || "",
            isActive: v.isActive !== false,
          })),
          featured: Boolean(p.featured),
          sortOrder: String(p.sortOrder ?? 0),
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

  const handleAttributesChange = (attributes) => {
    setForm((prev) => ({ ...prev, attributes }));
  };

  const handleVariantsChange = ({ options, variants }) => {
    setForm((prev) => ({ ...prev, options, variants }));
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
        category: form.category || null,
        images: form.images,
        // Filas vacías fuera; el resto se manda recortado (el backend valida).
        attributes: form.attributes
          .map((a) => ({ name: a.name.trim(), value: a.value.trim() }))
          .filter((a) => a.name || a.value),
        ...toVariantsPayload(form.options, form.variants),
        featured: form.featured,
        sortOrder: Number(form.sortOrder || 0),
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
    <section style={{ maxWidth: 1300 }}>
      <h3>{isEditing ? "Editar producto" : "Nuevo producto"}</h3>

      {error ? <Alert type="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
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

        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Precio (MXN)
            <input type="number" name="price" min="0" step="0.01" value={form.price} onChange={handleChange} required />
          </label>
          <label>
            Precio comparativo (opcional)
            <input type="number" name="compareAtPrice" min="0" step="0.01" value={form.compareAtPrice} onChange={handleChange} />
          </label>
        </div>

        <div className="form-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
          <label>
            Categoría (opcional)
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
          <label>
            Orden
            <input type="number" name="sortOrder" min="0" step="1" value={form.sortOrder} onChange={handleChange} />
          </label>
        </div>

        <ProductImageGallery value={form.images} onChange={handleImagesChange} />

        <ProductAttributesEditor value={form.attributes} onChange={handleAttributesChange} />

        <ProductVariantsEditor
          options={form.options}
          variants={form.variants}
          onChange={handleVariantsChange}
          productSku={form.sku.trim().toUpperCase()}
          productPrice={form.price}
          productImages={form.images}
        />

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
          <input type="checkbox" name="featured" checked={form.featured} onChange={handleChange} style={{ width: "auto" }} />
          Producto destacado
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
