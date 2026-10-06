import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  apiUrl,
  authHeaders,
  jsonHeaders,
  errorMessage,
  formatMxn,
  formatDate,
  todayInput,
  Badge,
  SALE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD_LABELS,
} from "../utils/storeFinance";
import Alert from "./Alert";

const PaymentMethodSelect = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}>
    {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
      <option key={key} value={key}>
        {label}
      </option>
    ))}
  </select>
);

// Venta de mayoreo: entregar (descuenta inventario), registrar/borrar
// abonos, cancelar.
const WholesaleSaleDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sale, setSale] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deliver, setDeliver] = useState({ deliveredAt: todayInput(), paidNow: false, method: "cash" });
  const [payment, setPayment] = useState({ amount: "", paidAt: todayInput(), method: "transfer", note: "" });

  const load = useCallback(async () => {
    try {
      const response = await axios.get(apiUrl(`/api/wholesale/sales/${id}`), { headers: authHeaders() });
      setSale(response.data);
    } catch (err) {
      setError(errorMessage(err, "No fue posible cargar la venta."));
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
      return true;
    } catch (err) {
      setError(errorMessage(err, "No fue posible completar la acción."));
      return err;
    } finally {
      setBusy(false);
    }
  };

  const handleDeliver = async (force = false) => {
    const body = { deliveredAt: deliver.deliveredAt, ...(deliver.paidNow ? { payment: { method: deliver.method } } : {}), ...(force ? { force: true } : {}) };
    const result = await run(() => axios.post(apiUrl(`/api/wholesale/sales/${id}/deliver`), body, { headers: jsonHeaders() }), "Venta entregada: inventario descontado.");
    if (result !== true && result?.response?.data?.error?.code === "CREDIT_LIMIT_EXCEEDED") {
      if (window.confirm(`${result.response.data.error.message}\n\n¿Entregar de todos modos?`)) {
        setError("");
        await handleDeliver(true);
      }
    }
  };

  const handlePayment = async (event) => {
    event.preventDefault();
    const ok = await run(
      () => axios.post(apiUrl(`/api/wholesale/sales/${id}/payments`), { ...payment, amount: Number(payment.amount) }, { headers: jsonHeaders() }),
      "Abono registrado."
    );
    if (ok === true) setPayment({ amount: "", paidAt: todayInput(), method: "transfer", note: "" });
  };

  const handleDeletePayment = (paymentId) => {
    if (!window.confirm("¿Borrar este abono?")) return;
    run(() => axios.delete(apiUrl(`/api/wholesale/sales/${id}/payments/${paymentId}`), { headers: authHeaders() }), "Abono eliminado.");
  };

  const handleCancel = () => {
    if (!window.confirm(sale.status === "delivered" ? "¿Cancelar la venta? El inventario regresa." : "¿Cancelar la venta?")) return;
    run(() => axios.post(apiUrl(`/api/wholesale/sales/${id}/cancel`), {}, { headers: jsonHeaders() }), "Venta cancelada.");
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Borrar este borrador?")) return;
    try {
      await axios.delete(apiUrl(`/api/wholesale/sales/${id}`), { headers: authHeaders() });
      navigate("/admin/wholesale/sales");
    } catch (err) {
      setError(errorMessage(err, "No fue posible borrar la venta."));
    }
  };

  if (!sale) return <section>{error ? <Alert type="error">{error}</Alert> : <p>Cargando...</p>}</section>;
  const customerId = sale.customer?._id || sale.customer;
  const overdue = sale.status === "delivered" && sale.balance > 0.004 && sale.dueDate && +new Date(sale.dueDate) < Date.now();

  return (
    <section style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>
          Venta de mayoreo #{sale.folio} <Badge map={SALE_STATUS} value={sale.status} />{" "}
          {sale.status === "delivered" ? <Badge map={PAYMENT_STATUS} value={sale.paymentStatus} /> : null}
        </h3>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {sale.status === "draft" ? (
            <>
              <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => navigate(`/admin/wholesale/sales/${id}/edit`)}>
                Editar
              </button>
              <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={handleDelete}>
                Borrar
              </button>
            </>
          ) : null}
          {sale.status !== "cancelled" && sale.payments.length === 0 ? (
            <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={handleCancel} disabled={busy}>
              Cancelar venta
            </button>
          ) : null}
        </div>
      </div>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      <p style={{ marginTop: "0.75rem" }}>
        Cliente: <Link to={`/admin/wholesale/customers/${customerId}`}>{sale.customerName}</Link>
        <br />
        Registrada el {formatDate(sale.createdAt)}
        {sale.deliveredAt ? ` · entregada el ${formatDate(sale.deliveredAt)}` : ""}
        {sale.dueDate && sale.status === "delivered" ? (
          <>
            {" · vence el "}
            <span className={overdue ? "badge badge-red" : ""}>{formatDate(sale.dueDate)}</span>
          </>
        ) : null}
      </p>
      {sale.notes ? <p style={{ whiteSpace: "pre-wrap" }}>{sale.notes}</p> : null}

      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Precio</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, i) => (
            <tr key={i}>
              <td>
                {item.productName}
                {item.variantLabel ? ` · ${item.variantLabel}` : ""}
              </td>
              <td>{item.quantity}</td>
              <td>{formatMxn(item.unitPrice)}</td>
              <td>{formatMxn(item.subtotal)}</td>
            </tr>
          ))}
          {sale.discount > 0 ? (
            <tr>
              <td colSpan={3} style={{ textAlign: "right" }}>
                Descuento
              </td>
              <td>−{formatMxn(sale.discount)}</td>
            </tr>
          ) : null}
          <tr>
            <td colSpan={3} style={{ textAlign: "right" }}>
              <strong>Total</strong>
            </td>
            <td>
              <strong>{formatMxn(sale.total)}</strong>
            </td>
          </tr>
          {sale.status === "delivered" ? (
            <tr>
              <td colSpan={3} style={{ textAlign: "right" }}>
                Saldo pendiente
              </td>
              <td>
                <strong>{formatMxn(sale.balance)}</strong>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {sale.status === "draft" ? (
        <div style={{ marginTop: "1.5rem", maxWidth: 700 }}>
          <h4>Entregar</h4>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ marginBottom: 0 }}>
              Fecha de entrega
              <input type="date" value={deliver.deliveredAt} onChange={(e) => setDeliver((d) => ({ ...d, deliveredAt: e.target.value }))} />
            </label>
            <label style={{ marginBottom: 0, display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input type="checkbox" checked={deliver.paidNow} onChange={(e) => setDeliver((d) => ({ ...d, paidNow: e.target.checked }))} style={{ width: "auto" }} />
              Pagada al entregar
            </label>
            {deliver.paidNow ? (
              <label style={{ marginBottom: 0 }}>
                Forma de pago
                <PaymentMethodSelect value={deliver.method} onChange={(method) => setDeliver((d) => ({ ...d, method }))} />
              </label>
            ) : null}
            <button type="button" style={{ width: "auto" }} disabled={busy} onClick={() => handleDeliver(false)}>
              Marcar como entregada
            </button>
          </div>
        </div>
      ) : null}

      {sale.status === "delivered" || sale.payments.length > 0 ? (
        <div style={{ marginTop: "1.5rem" }}>
          <h4>Abonos</h4>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Monto</th>
                <th>Forma de pago</th>
                <th>Nota</th>
                <th>Registró</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sale.payments.length === 0 ? (
                <tr>
                  <td colSpan={6}>Sin abonos.</td>
                </tr>
              ) : null}
              {sale.payments.map((p) => (
                <tr key={p._id}>
                  <td>{formatDate(p.paidAt)}</td>
                  <td>{formatMxn(p.amount)}</td>
                  <td>{PAYMENT_METHOD_LABELS[p.method] || p.method}</td>
                  <td>{p.note || "—"}</td>
                  <td>{p.by?.name || "—"}</td>
                  <td>
                    <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => handleDeletePayment(p._id)} disabled={busy}>
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {sale.status === "delivered" && sale.balance > 0.004 ? (
            <form onSubmit={handlePayment} style={{ maxWidth: "none", margin: "1rem 0 0", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ marginBottom: 0, width: 160 }}>
                Monto
                <input type="number" min="0.01" step="0.01" max={sale.balance} value={payment.amount} placeholder={String(sale.balance)} onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))} required />
              </label>
              <label style={{ marginBottom: 0 }}>
                Fecha
                <input type="date" value={payment.paidAt} onChange={(e) => setPayment((p) => ({ ...p, paidAt: e.target.value }))} />
              </label>
              <label style={{ marginBottom: 0 }}>
                Forma de pago
                <PaymentMethodSelect value={payment.method} onChange={(method) => setPayment((p) => ({ ...p, method }))} />
              </label>
              <label style={{ marginBottom: 0, flex: "1 1 200px" }}>
                Nota
                <input type="text" value={payment.note} maxLength={300} onChange={(e) => setPayment((p) => ({ ...p, note: e.target.value }))} />
              </label>
              <button type="submit" style={{ width: "auto" }} disabled={busy}>
                Registrar abono
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default WholesaleSaleDetail;
