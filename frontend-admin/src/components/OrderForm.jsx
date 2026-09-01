import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const OrderForm = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [contact, setContact] = useState({ customerName: "", customerEmail: "", customerPhone: "", shippingAddress: "", notes: "" });
  const [lines, setLines] = useState([{ product: "", quantity: 1 }]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await axios.get(`${baseUrl}/api/products`, { headers: getAuthHeaders(), params: { isActive: "true" } });
        setProducts(response.data?.items || []);
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar los productos.");
      }
    };
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const productsById = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);

  const handleContactChange = (event) => {
    const { name, value } = event.target;
    setContact((prev) => ({ ...prev, [name]: value }));
  };

  const handleLineChange = (index, field, value) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const addLine = () => setLines((prev) => [...prev, { product: "", quantity: 1 }]);
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index));

  const total = lines.reduce((sum, line) => {
    const product = productsById.get(line.product);
    if (!product) return sum;
    return sum + product.price * Number(line.quantity || 0);
  }, 0);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validLines = lines.filter((l) => l.product && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setError("Agrega al menos un artículo con cantidad válida.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const payload = {
        ...contact,
        items: validLines.map((l) => ({ product: l.product, quantity: Number(l.quantity) })),
      };
      const response = await axios.post(`${baseUrl}/api/orders`, payload, {
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      });
      navigate(`/admin/orders/${response.data.order._id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible crear el pedido.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section>
      <h3>Nuevo pedido</h3>
      <p>Sin carrito/checkout todavía en el sitio público — se registra manualmente.</p>

      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: 700, margin: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Nombre del cliente
            <input type="text" name="customerName" value={contact.customerName} onChange={handleContactChange} required />
          </label>
          <label>
            Correo
            <input type="email" name="customerEmail" value={contact.customerEmail} onChange={handleContactChange} required />
          </label>
          <label>
            Teléfono (opcional)
            <input type="text" name="customerPhone" value={contact.customerPhone} onChange={handleContactChange} />
          </label>
          <label>
            Dirección de envío (opcional)
            <input type="text" name="shippingAddress" value={contact.shippingAddress} onChange={handleContactChange} />
          </label>
        </div>
        <label>
          Notas (opcional)
          <input type="text" name="notes" value={contact.notes} onChange={handleContactChange} />
        </label>

        <h4 style={{ marginTop: "1.5rem" }}>Artículos</h4>
        {lines.map((line, index) => {
          const product = productsById.get(line.product);
          return (
            <div key={index} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.5rem" }}>
              <label style={{ flex: 2, marginBottom: 0 }}>
                Producto
                <select value={line.product} onChange={(e) => handleLineChange(index, "product", e.target.value)} required>
                  <option value="">Selecciona un producto</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.sku}) — {formatMxn(p.price)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ width: 100, marginBottom: 0 }}>
                Cantidad
                <input
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => handleLineChange(index, "quantity", e.target.value)}
                  required
                />
              </label>
              <div style={{ minWidth: 100 }}>{product ? formatMxn(product.price * Number(line.quantity || 0)) : "—"}</div>
              {lines.length > 1 ? (
                <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => removeLine(index)}>
                  Quitar
                </button>
              ) : null}
            </div>
          );
        })}
        <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={addLine}>
          Agregar artículo
        </button>

        <p style={{ marginTop: "1rem" }}>
          <strong>Total: {formatMxn(total)}</strong>
        </p>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Creando..." : "Crear pedido"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate("/admin/orders")}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default OrderForm;
