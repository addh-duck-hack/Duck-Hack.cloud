import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import OrderPaymentProofs from "./OrderPaymentProofs";
import { GIFT_CARD_STATUS, formatDay, formatMxn } from "./GiftCardList";

// Detalle de una tarjeta de regalo: datos, comprobantes (aprobar = activar y
// enviar), canje en el local, ajuste de saldo, vigencia, reenvío, PDF y
// movimientos (packages/core-api/modules/giftCards.js).

const MOVEMENT_LABELS = {
  purchase: "Compra",
  redeem: "Canje",
  refund: "Devolución",
  adjust: "Ajuste",
  expire: "Vencimiento",
  cancel: "Cancelación",
};

const dateInput = (value) => (value ? new Date(value).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }) : "");

const GiftCardDetail = () => {
  const { id } = useParams();
  const [card, setCard] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [redeem, setRedeem] = useState({ amount: "", note: "" });
  const [adjust, setAdjust] = useState({ delta: "", note: "" });
  const [expiresAt, setExpiresAt] = useState("");
  const [resendEmail, setResendEmail] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const apply = (data) => {
    setCard(data);
    setExpiresAt(dateInput(data.expiresAt));
    setResendEmail(data.recipientEmail || "");
  };

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${baseUrl}/api/gift-cards/${id}`, { headers: getAuthHeaders() });
      apply(data);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar la tarjeta.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Acción que responde { message, giftCard }: recarga el detalle (con movimientos).
  const run = async (path, body, { confirm } = {}) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await axios.post(`${baseUrl}/api/gift-cards/${id}/${path}`, body, { headers: getAuthHeaders() });
      setMessage(data.message);
      await load();
      return true;
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible completar la acción.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openPdf = async () => {
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/gift-cards/${id}/pdf`, { headers: getAuthHeaders(), responseType: "blob" });
      window.open(URL.createObjectURL(response.data), "_blank");
    } catch {
      setError("No fue posible abrir la tarjeta en PDF.");
    }
  };

  if (!card) {
    return (
      <section>
        <Link to="/admin/gift-cards">← Tarjetas de regalo</Link>
        {error ? <div className="auth-error">{error}</div> : <p>Cargando...</p>}
      </section>
    );
  }

  const info = GIFT_CARD_STATUS[card.status] || { label: card.status, color: "" };
  const activated = ["active", "used", "expired"].includes(card.status);

  return (
    <section style={{ maxWidth: 900 }}>
      <Link to="/admin/gift-cards">← Tarjetas de regalo</Link>
      <h3 style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        Tarjeta #{card.number} <span className={`badge badge-${info.color}`}>{info.label}</span>
      </h3>
      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
        <div>
          <small>Código</small>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.2rem" }}>{activated ? card.code : "Se muestra al activarse"}</div>
        </div>
        <div>
          <small>Saldo</small>
          <div style={{ fontSize: "1.2rem" }}>
            {formatMxn(card.balance)} <small>de {formatMxn(card.amount)}</small>
          </div>
        </div>
        <div>
          <small>Vigencia</small>
          <div>{card.expiresAt ? formatDay(card.expiresAt) : activated ? "No vence" : "Desde que se active"}</div>
        </div>
        <div>
          <small>Origen</small>
          <div>{card.source === "staff" ? `Mostrador${card.paymentNote ? ` (${card.paymentNote})` : ""}` : "Sitio (SPEI)"}</div>
        </div>
      </div>

      <table style={{ marginTop: "1rem" }}>
        <tbody>
          <tr>
            <th>Quién regala</th>
            <td>
              {card.buyerName}
              {card.buyerEmail ? ` · ${card.buyerEmail}` : ""}
              {card.buyerPhone ? ` · ${card.buyerPhone}` : ""}
            </td>
          </tr>
          <tr>
            <th>Para</th>
            <td>
              {card.recipientName || "—"}
              {card.recipientEmail ? ` · ${card.recipientEmail}` : ""}
            </td>
          </tr>
          {card.message ? (
            <tr>
              <th>Mensaje</th>
              <td>{card.message}</td>
            </tr>
          ) : null}
          <tr>
            <th>Creada</th>
            <td>
              {formatDay(card.createdAt)}
              {card.activatedAt ? ` · activada ${formatDay(card.activatedAt)}` : ""}
              {card.cancelledAt ? ` · cancelada ${formatDay(card.cancelledAt)}${card.cancelReason ? `: ${card.cancelReason}` : ""}` : ""}
            </td>
          </tr>
        </tbody>
      </table>

      {card.source === "web" ? <OrderPaymentProofs order={card} kind="giftCard" onChange={(updated, text) => { setMessage(text); if (updated) load(); }} /> : null}

      {activated ? (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
          <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={openPdf}>
            <i className="fas fa-file-pdf" aria-hidden="true" /> Tarjeta en PDF
          </button>
        </div>
      ) : null}

      {card.status === "active" ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run("redeem", { amount: Number(redeem.amount), note: redeem.note })) setRedeem({ amount: "", note: "" });
          }}
          style={{ maxWidth: "none", margin: "1rem 0" }}
        >
          <h4>Cobrar con la tarjeta (en el local)</h4>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: "0.5rem", alignItems: "end" }}>
            <label>
              Monto
              <input type="number" min="0.01" step="0.01" max={card.balance} value={redeem.amount} onChange={(e) => setRedeem({ ...redeem, amount: e.target.value })} required />
            </label>
            <label>
              Nota (opcional)
              <input value={redeem.note} maxLength={200} placeholder="Ej. Corte y peinado" onChange={(e) => setRedeem({ ...redeem, note: e.target.value })} />
            </label>
            <button type="submit" disabled={busy} style={{ width: "auto" }}>
              Cobrar
            </button>
          </div>
        </form>
      ) : null}

      {activated ? (
        <details style={{ margin: "1rem 0" }}>
          <summary>Más acciones</summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run("adjust", { delta: Number(adjust.delta), note: adjust.note })) setAdjust({ delta: "", note: "" });
            }}
            style={{ maxWidth: "none", margin: "1rem 0" }}
          >
            <h4>Ajustar saldo</h4>
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: "0.5rem", alignItems: "end" }}>
              <label>
                Sumar (+) o restar (−)
                <input type="number" step="0.01" value={adjust.delta} onChange={(e) => setAdjust({ ...adjust, delta: e.target.value })} required />
              </label>
              <label>
                Motivo
                <input value={adjust.note} maxLength={200} required onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
              </label>
              <button type="submit" disabled={busy} style={{ width: "auto" }}>
                Ajustar
              </button>
            </div>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run("extend", { expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:00`).toISOString() : null });
            }}
            style={{ maxWidth: "none", margin: "1rem 0" }}
          >
            <h4>Vigencia</h4>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "end", flexWrap: "wrap" }}>
              <label>
                Vence el (vacío = no vence)
                <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </label>
              <button type="submit" disabled={busy} style={{ width: "auto" }}>
                Guardar vigencia
              </button>
            </div>
          </form>
          {card.status !== "expired" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run("resend", { recipientEmail: resendEmail });
              }}
              style={{ maxWidth: "none", margin: "1rem 0" }}
            >
              <h4>Reenviar por correo</h4>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "end", flexWrap: "wrap" }}>
                <label style={{ flex: "1 1 240px" }}>
                  Correo de quien la recibe
                  <input type="email" value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} />
                </label>
                <button type="submit" disabled={busy} style={{ width: "auto" }}>
                  Reenviar
                </button>
              </div>
            </form>
          ) : null}
        </details>
      ) : null}

      {card.status !== "cancelled" ? (
        <button
          type="button"
          className="btn-secondary"
          style={{ width: "auto" }}
          disabled={busy}
          onClick={() => {
            const reason = window.prompt("Motivo de la cancelación (el saldo se pierde):");
            if (reason !== null) run("cancel", { reason });
          }}
        >
          Cancelar tarjeta
        </button>
      ) : null}

      {card.movements?.length ? (
        <>
          <h4 style={{ marginTop: "1.5rem" }}>Movimientos</h4>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Monto</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {[...card.movements].reverse().map((m, i) => (
                  <tr key={i}>
                    <td>{formatDay(m.at)}</td>
                    <td>{MOVEMENT_LABELS[m.type] || m.type}</td>
                    <td style={{ color: m.delta < 0 ? "var(--error-color)" : undefined }}>
                      {m.delta > 0 ? "+" : "−"}
                      {formatMxn(Math.abs(m.delta))}
                    </td>
                    <td>
                      {m.order?.orderNumber ? <Link to={`/admin/orders/${m.order._id}`}>Pedido #{m.order.orderNumber}</Link> : null}
                      {m.appointment?.appointmentNumber ? `Cita #${m.appointment.appointmentNumber}` : null}
                      {m.note && !(m.order?.orderNumber && m.note === `Pedido #${m.order.orderNumber}`) ? ` ${m.note}` : null}
                      {m.by?.name ? <small style={{ opacity: 0.7 }}> · {m.by.name}</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
};

export default GiftCardDetail;
