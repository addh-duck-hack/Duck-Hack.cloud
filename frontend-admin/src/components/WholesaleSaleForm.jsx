import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiUrl, authHeaders, jsonHeaders, errorMessage, formatMxn } from "../utils/storeFinance";
import LineItemsEditor, { emptyLine } from "./LineItemsEditor";
import Alert from "./Alert";

// Alta/edición de una venta de mayoreo en borrador. El precio vacío toma el
// de catálogo menos el descuento del cliente (lo calcula el backend; aquí solo
// se muestra como sugerencia).
const WholesaleSaleForm = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customer, setCustomer] = useState(searchParams.get("customer") || "");
  const [lines, setLines] = useState([emptyLine()]);
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      axios.get(apiUrl("/api/wholesale/customers"), { headers: authHeaders(), params: { active: "true" } }),
      axios.get(apiUrl("/api/products"), { headers: authHeaders() }),
    ])
      .then(([c, p]) => {
        setCustomers(c.data?.customers || []);
        setProducts(p.data?.items || []);
      })
      .catch((err) => setError(errorMessage(err, "No fue posible cargar clientes y productos.")));
  }, []);

  useEffect(() => {
    if (!id) return;
    axios
      .get(apiUrl(`/api/wholesale/sales/${id}`), { headers: authHeaders() })
      .then(({ data }) => {
        if (data.status !== "draft") {
          navigate(`/admin/wholesale/sales/${id}`, { replace: true });
          return;
        }
        setCustomer(data.customer?._id || data.customer);
        setLines(data.items.map((i) => ({ product: i.product, variant: i.variant || "", description: "", quantity: i.quantity, price: i.unitPrice })));
        setDiscount(data.discount ? String(data.discount) : "");
        setNotes(data.notes || "");
      })
      .catch((err) => setError(errorMessage(err, "No fue posible cargar la venta.")));
  }, [id, navigate]);

  const selected = useMemo(() => customers.find((c) => c._id === customer), [customers, customer]);
  const discountPct = selected?.discountPct || 0;
  const suggestedPrice = (product, variant) => {
    const base = variant && variant.price !== undefined && variant.price !== null ? variant.price : product.price;
    return Math.round(base * (1 - discountPct / 100) * 100) / 100;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const payload = {
        customer,
        discount: discount === "" ? 0 : Number(discount),
        notes,
        items: lines.map((l) => ({
          product: l.product,
          ...(l.variant ? { variant: l.variant } : {}),
          quantity: Number(l.quantity),
          ...(l.price !== "" ? { unitPrice: Number(l.price) } : {}),
        })),
      };
      const response = id
        ? await axios.put(apiUrl(`/api/wholesale/sales/${id}`), payload, { headers: jsonHeaders() })
        : await axios.post(apiUrl("/api/wholesale/sales"), payload, { headers: jsonHeaders() });
      navigate(`/admin/wholesale/sales/${response.data.sale._id}`);
    } catch (err) {
      setError(errorMessage(err, "No fue posible guardar la venta."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section style={{ maxWidth: 1300 }}>
      <h3>{id ? "Editar venta de mayoreo" : "Nueva venta de mayoreo"}</h3>
      <p>Se guarda como borrador; el inventario se descuenta al marcarla como entregada.</p>
      {error ? <Alert type="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <label style={{ maxWidth: 480 }}>
          Cliente mayorista
          <select value={customer} onChange={(e) => setCustomer(e.target.value)} required>
            <option value="">Selecciona un cliente</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.businessName}
                {c.balance > 0 ? ` — debe ${formatMxn(c.balance)}` : ""}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <p style={{ fontSize: "0.9rem", color: "var(--placeholder-color)" }}>
            {selected.creditDays ? `Crédito a ${selected.creditDays} días` : "Contado"}
            {discountPct ? ` · ${discountPct} % de descuento sugerido` : ""}
            {selected.creditLimit !== null && selected.creditLimit !== undefined ? ` · límite ${formatMxn(selected.creditLimit)}` : ""}
          </p>
        ) : null}

        <h4 style={{ marginTop: "1.5rem" }}>Productos</h4>
        <LineItemsEditor products={products} lines={lines} onChange={setLines} suggestedPrice={suggestedPrice} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem", maxWidth: 800 }}>
          <label>
            Descuento adicional ($)
            <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </label>
          <label>
            Notas
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          </label>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Guardando..." : "Guardar borrador"}
          </button>
          <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => navigate(id ? `/admin/wholesale/sales/${id}` : "/admin/wholesale/sales")}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default WholesaleSaleForm;
