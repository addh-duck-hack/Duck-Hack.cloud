import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { apiUrl, authHeaders, jsonHeaders, errorMessage, formatMxn, formatDate, todayInput, Badge, PURCHASE_STATUS, PAYMENT_METHOD_LABELS } from "../utils/storeFinance";
import Alert from "./Alert";

// Compra a proveedor: recibir (sube inventario), pagar / quitar pago (su
// gasto en Contabilidad), cancelar.
const PurchaseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [purchase, setPurchase] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [receivedAt, setReceivedAt] = useState(todayInput());
  const [pay, setPay] = useState({ paidAt: todayInput(), paymentMethod: "transfer" });

  const load = useCallback(async () => {
    try {
      const response = await axios.get(apiUrl(`/api/store-accounting/purchases/${id}`), { headers: authHeaders() });
      setPurchase(response.data);
    } catch (err) {
      setError(errorMessage(err, "No fue posible cargar la compra."));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (request, success) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request();
      await load();
      setMessage(success);
    } catch (err) {
      setError(errorMessage(err, "No fue posible completar la acción."));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Borrar esta compra?")) return;
    try {
      await axios.delete(apiUrl(`/api/store-accounting/purchases/${id}`), { headers: authHeaders() });
      navigate("/admin/finance/purchases");
    } catch (err) {
      setError(errorMessage(err, "No fue posible borrar la compra."));
    }
  };

  if (!purchase) return <section>{error ? <Alert type="error">{error}</Alert> : <p>Cargando...</p>}</section>;
  const isActive = purchase.status !== "cancelled";

  return (
    <section style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>
          Compra #{purchase.folio} <Badge map={PURCHASE_STATUS} value={purchase.status} />{" "}
          {isActive ? purchase.paidAt ? <span className="badge badge-green">Pagada</span> : <span className="badge badge-yellow">Sin pagar</span> : null}
        </h3>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {isActive ? (
            <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => navigate(`/admin/finance/purchases/${id}/edit`)}>
              Editar
            </button>
          ) : null}
          {purchase.status === "draft" && !purchase.paidAt ? (
            <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={handleDelete}>
              Borrar
            </button>
          ) : null}
          {isActive && !purchase.paidAt ? (
            <button
              type="button"
              className="btn-secondary"
              style={{ width: "auto" }}
              disabled={busy}
              onClick={() => {
                if (window.confirm(purchase.status === "received" ? "¿Cancelar la compra? Lo que entró al inventario se descuenta." : "¿Cancelar la compra?")) {
                  run(() => axios.post(apiUrl(`/api/store-accounting/purchases/${id}/cancel`), {}, { headers: jsonHeaders() }), "Compra cancelada.");
                }
              }}
            >
              Cancelar compra
            </button>
          ) : null}
        </div>
      </div>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <p style={{ marginTop: "0.75rem" }}>
        Proveedor: {purchase.supplier?.name || purchase.supplierName} · {formatDate(purchase.date)}
        {purchase.reference ? ` · ref. ${purchase.reference}` : ""} · categoría {purchase.category}
        {purchase.receivedAt ? ` · recibida el ${formatDate(purchase.receivedAt)}` : ""}
        {purchase.paidAt ? ` · pagada el ${formatDate(purchase.paidAt)}${purchase.paymentMethod ? ` (${PAYMENT_METHOD_LABELS[purchase.paymentMethod]})` : ""}` : ""}
      </p>
      {purchase.notes ? <p style={{ whiteSpace: "pre-wrap" }}>{purchase.notes}</p> : null}

      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th>Inventario</th>
            <th>Cantidad</th>
            <th>Costo</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {purchase.items.map((item, i) => (
            <tr key={i}>
              <td>{item.description}</td>
              <td>{item.product ? "Sí" : "Insumo"}</td>
              <td>{item.quantity}</td>
              <td>{formatMxn(item.unitCost)}</td>
              <td>{formatMxn(item.subtotal)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={4} style={{ textAlign: "right" }}>
              <strong>Total</strong>
            </td>
            <td>
              <strong>{formatMxn(purchase.total)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
        {purchase.status === "draft" ? (
          <div>
            <h4>Recibir</h4>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
              <label style={{ marginBottom: 0 }}>
                Fecha
                <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
              </label>
              <button
                type="button"
                style={{ width: "auto" }}
                disabled={busy}
                onClick={() => run(() => axios.post(apiUrl(`/api/store-accounting/purchases/${id}/receive`), { receivedAt }, { headers: jsonHeaders() }), "Compra recibida: inventario actualizado.")}
              >
                Marcar como recibida
              </button>
            </div>
          </div>
        ) : null}

        {isActive ? (
          <div>
            <h4>{purchase.paidAt ? "Pago" : "Pagar"}</h4>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={{ marginBottom: 0 }}>
                Fecha de pago
                <input type="date" value={pay.paidAt} onChange={(e) => setPay((p) => ({ ...p, paidAt: e.target.value }))} />
              </label>
              <label style={{ marginBottom: 0 }}>
                Forma de pago
                <select value={pay.paymentMethod} onChange={(e) => setPay((p) => ({ ...p, paymentMethod: e.target.value }))}>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                style={{ width: "auto" }}
                disabled={busy}
                onClick={() => run(() => axios.post(apiUrl(`/api/store-accounting/purchases/${id}/pay`), pay, { headers: jsonHeaders() }), "Pago registrado como gasto.")}
              >
                {purchase.paidAt ? "Corregir pago" : "Registrar pago"}
              </button>
              {purchase.paidAt ? (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: "auto" }}
                  disabled={busy}
                  onClick={() => run(() => axios.delete(apiUrl(`/api/store-accounting/purchases/${id}/pay`), { headers: authHeaders() }), "Pago eliminado.")}
                >
                  Quitar pago
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default PurchaseDetail;
