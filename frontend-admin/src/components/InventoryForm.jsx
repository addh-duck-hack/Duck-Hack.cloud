import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const initialState = { product: "", quantity: "0", lowStockThreshold: "0", notes: "" };

const InventoryForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await axios.get(`${baseUrl}/api/products`, { headers: getAuthHeaders() });
        setProducts(response.data?.items || []);
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar los productos.");
      }
    };
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    const loadItem = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await axios.get(`${baseUrl}/api/inventory/${id}`, { headers: getAuthHeaders() });
        const item = response.data || {};
        setForm({
          product: item.product?._id || item.product || "",
          quantity: String(item.quantity ?? "0"),
          lowStockThreshold: String(item.lowStockThreshold ?? "0"),
          notes: item.notes || "",
        });
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar el registro de inventario.");
      } finally {
        setIsLoading(false);
      }
    };
    loadItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const payload = {
        quantity: Number(form.quantity),
        lowStockThreshold: Number(form.lowStockThreshold),
        notes: form.notes,
      };
      if (!isEditing) payload.product = form.product;

      if (isEditing) {
        await axios.put(`${baseUrl}/api/inventory/${id}`, payload, {
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        });
      } else {
        await axios.post(`${baseUrl}/api/inventory`, payload, {
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        });
      }
      navigate("/admin/inventory");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar el inventario.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <p>Cargando...</p>;

  return (
    <section>
      <h3>{isEditing ? "Editar inventario" : "Registrar inventario"}</h3>

      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: 500, margin: 0 }}>
        <label>
          Producto
          <select name="product" value={form.product} onChange={handleChange} required disabled={isEditing}>
            <option value="">Selecciona un producto</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </label>

        <label>
          Cantidad
          <input type="number" name="quantity" min="0" value={form.quantity} onChange={handleChange} required />
        </label>

        <label>
          Umbral de stock bajo
          <input type="number" name="lowStockThreshold" min="0" value={form.lowStockThreshold} onChange={handleChange} />
        </label>

        <label>
          Notas (opcional)
          <input type="text" name="notes" value={form.notes} onChange={handleChange} />
        </label>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/inventory")}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default InventoryForm;
