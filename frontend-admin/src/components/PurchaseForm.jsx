import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { apiUrl, authHeaders, jsonHeaders, errorMessage, todayInput } from "../utils/storeFinance";
import LineItemsEditor, { emptyLine } from "./LineItemsEditor";
import Alert from "./Alert";

// Alta/edición de una compra a proveedor. Proveedor y renglones solo se
// cambian en borrador sin pagar (el backend lo hace cumplir); fecha,
// referencia, categoría y notas siempre.
const PurchaseForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [header, setHeader] = useState({ supplier: "", date: todayInput(), reference: "", category: "Compras", notes: "" });
  const [lines, setLines] = useState([emptyLine()]);
  const [linesLocked, setLinesLocked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      axios.get(apiUrl("/api/store-accounting/suppliers"), { headers: authHeaders(), params: { active: "true" } }),
      axios.get(apiUrl("/api/products"), { headers: authHeaders() }),
      axios.get(apiUrl("/api/store-accounting/categories"), { headers: authHeaders() }),
    ])
      .then(([s, p, c]) => {
        setSuppliers(s.data?.suppliers || []);
        setProducts(p.data?.items || []);
        setCategories(c.data?.categories || []);
      })
      .catch((err) => setError(errorMessage(err, "No fue posible cargar proveedores y productos.")));
  }, []);

  useEffect(() => {
    if (!id) return;
    axios
      .get(apiUrl(`/api/store-accounting/purchases/${id}`), { headers: authHeaders() })
      .then(({ data }) => {
        setHeader({
          supplier: data.supplier?._id || data.supplier,
          date: data.date ? data.date.slice(0, 10) : "",
          reference: data.reference || "",
          category: data.category || "Compras",
          notes: data.notes || "",
        });
        setLines(data.items.map((i) => ({ product: i.product || "", variant: i.variant || "", description: i.description, quantity: i.quantity, price: i.unitCost })));
        setLinesLocked(data.status !== "draft" || Boolean(data.paidAt));
      })
      .catch((err) => setError(errorMessage(err, "No fue posible cargar la compra.")));
  }, [id]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const payload = { ...header };
      if (linesLocked) delete payload.supplier;
      else
        payload.items = lines.map((l) => ({
          ...(l.product ? { product: l.product } : {}),
          ...(l.variant ? { variant: l.variant } : {}),
          description: l.description,
          quantity: Number(l.quantity),
          unitCost: Number(l.price),
        }));
      const response = id
        ? await axios.put(apiUrl(`/api/store-accounting/purchases/${id}`), payload, { headers: jsonHeaders() })
        : await axios.post(apiUrl("/api/store-accounting/purchases"), payload, { headers: jsonHeaders() });
      navigate(`/admin/finance/purchases/${response.data.purchase._id}`);
    } catch (err) {
      setError(errorMessage(err, "No fue posible guardar la compra."));
    } finally {
      setIsSaving(false);
    }
  };

  const setField = (key) => (e) => setHeader((h) => ({ ...h, [key]: e.target.value }));

  return (
    <section style={{ maxWidth: 1300 }}>
      <h3>{id ? "Editar compra" : "Nueva compra"}</h3>
      {error ? <Alert type="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
          <label>
            Proveedor
            <select value={header.supplier} onChange={setField("supplier")} required disabled={linesLocked}>
              <option value="">Selecciona un proveedor</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha
            <input type="date" value={header.date} onChange={setField("date")} required />
          </label>
          <label>
            Folio o factura del proveedor
            <input type="text" value={header.reference} onChange={setField("reference")} maxLength={80} />
          </label>
          <label>
            Categoría del gasto
            <input type="text" list="purchase-categories" value={header.category} onChange={setField("category")} maxLength={80} />
            <datalist id="purchase-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        {suppliers.length === 0 ? (
          <p className="auth-error">
            Primero registra un proveedor en <a href="#/admin/finance/suppliers">Proveedores</a>.
          </p>
        ) : null}

        <h4 style={{ marginTop: "1.5rem" }}>Renglones</h4>
        {linesLocked ? (
          <p>La compra ya se recibió o pagó: sus renglones no se pueden cambiar.</p>
        ) : (
          <>
            <p style={{ fontSize: "0.9rem", color: "var(--placeholder-color)" }}>
              Los renglones con producto suben su inventario al recibir la compra; los insumos sin producto solo cuentan como gasto.
            </p>
            <LineItemsEditor products={products} lines={lines} onChange={setLines} priceLabel="Costo unitario" allowFreeText />
          </>
        )}

        <label>
          Notas
          <input type="text" value={header.notes} onChange={setField("notes")} maxLength={1000} />
        </label>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" disabled={isSaving} style={{ width: "auto" }}>
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => navigate(id ? `/admin/finance/purchases/${id}` : "/admin/finance/purchases")}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
};

export default PurchaseForm;
