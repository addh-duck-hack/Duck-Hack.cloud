import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { apiUrl, authHeaders, jsonHeaders, errorMessage, formatMxn } from "../utils/storeFinance";
import PhoneInput from "./PhoneInput";
import Alert from "./Alert";

const initialForm = { name: "", contactName: "", email: "", phone: "", rfc: "", notes: "", isActive: true };

// Proveedores de la tienda (Contabilidad): alta/edición en línea y lo que se
// les debe (compras recibidas sin pagar).
const SupplierList = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await axios.get(apiUrl("/api/store-accounting/suppliers"), { headers: authHeaders() });
      setSuppliers(response.data?.suppliers || []);
    } catch (err) {
      setError(errorMessage(err, "No fue posible cargar los proveedores."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const startEdit = (s) => {
    setEditingId(s._id);
    setForm(Object.fromEntries(Object.keys(initialForm).map((key) => [key, s[key] ?? initialForm[key]])));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (editingId) await axios.put(apiUrl(`/api/store-accounting/suppliers/${editingId}`), form, { headers: jsonHeaders() });
      else await axios.post(apiUrl("/api/store-accounting/suppliers"), form, { headers: jsonHeaders() });
      setMessage(editingId ? "Proveedor actualizado." : "Proveedor registrado.");
      setForm(null);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, "No fue posible guardar el proveedor."));
    }
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`¿Borrar a ${s.name}? Solo se puede si no tiene compras.`)) return;
    try {
      await axios.delete(apiUrl(`/api/store-accounting/suppliers/${s._id}`), { headers: authHeaders() });
      await load();
    } catch (err) {
      setError(errorMessage(err, "No fue posible borrar el proveedor."));
    }
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Proveedores</h3>
        <button
          type="button"
          style={{ width: "auto" }}
          onClick={() => {
            setEditingId(null);
            setForm((f) => (f && !editingId ? null : { ...initialForm }));
          }}
        >
          {form && !editingId ? "Cancelar" : "Nuevo proveedor"}
        </button>
      </div>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      {form ? (
        <form onSubmit={handleSubmit} style={{ maxWidth: 1000, margin: "1rem 0 0" }}>
          <h4>{editingId ? "Editar proveedor" : "Nuevo proveedor"}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <label>
              Nombre
              <input type="text" name="name" value={form.name} onChange={handleChange} maxLength={120} required />
            </label>
            <label>
              Contacto
              <input type="text" name="contactName" value={form.contactName} onChange={handleChange} maxLength={120} />
            </label>
            <label>
              Correo
              <input type="email" name="email" value={form.email} onChange={handleChange} />
            </label>
            <label>
              Teléfono
              <PhoneInput name="phone" value={form.phone} onChange={handleChange} />
            </label>
            <label>
              RFC
              <input type="text" name="rfc" value={form.rfc} onChange={handleChange} maxLength={13} style={{ textTransform: "uppercase" }} />
            </label>
            <label>
              Notas
              <input type="text" name="notes" value={form.notes} onChange={handleChange} maxLength={1000} />
            </label>
          </div>
          {editingId ? (
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} style={{ width: "auto" }} />
              Activo
            </label>
          ) : null}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button type="submit" style={{ width: "auto" }}>
              Guardar
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: "auto" }}
              onClick={() => {
                setForm(null);
                setEditingId(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <table>
        <thead>
          <tr>
            <th>Proveedor</th>
            <th>Contacto</th>
            <th>RFC</th>
            <th>Por pagar</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {suppliers.length === 0 ? (
            <tr>
              <td colSpan={5}>Sin proveedores.</td>
            </tr>
          ) : null}
          {suppliers.map((s) => (
            <tr key={s._id}>
              <td>
                <Link to={`/admin/finance/purchases?supplier=${s._id}`}>{s.name}</Link>
                {s.isActive === false ? <span className="badge" style={{ marginLeft: "0.5rem" }}>Desactivado</span> : null}
              </td>
              <td>{[s.contactName, s.phone, s.email].filter(Boolean).join(" · ") || "—"}</td>
              <td>{s.rfc || "—"}</td>
              <td>{s.payable > 0 ? <span className="badge badge-yellow">{formatMxn(s.payable)}</span> : "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button type="button" style={{ width: "auto" }} onClick={() => startEdit(s)}>
                  Editar
                </button>{" "}
                <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => handleDelete(s)}>
                  Borrar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default SupplierList;
