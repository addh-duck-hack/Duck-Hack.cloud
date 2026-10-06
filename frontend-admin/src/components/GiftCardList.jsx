import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import PhoneInput from "./PhoneInput";

// Tarjetas de regalo (módulo "giftCards" de los permisos; backend
// packages/core-api/modules/giftCards.js). Saldo en pesos que se usa en
// partes: en el checkout de la tienda, en el salón (canje desde la agenda o
// aquí) o para pagar el anticipo de una cita. Las del sitio esperan su pago
// por SPEI (se activan al aprobar el comprobante en el detalle); las de
// mostrador quedan activas al venderse.

// Fechas de la tarjeta (alta, vigencia, movimientos) en la hora de la tienda.
export const formatDay = (value) => (value ? new Date(value).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" }) : "");

export const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export const GIFT_CARD_STATUS = {
  pending_payment: { label: "Esperando pago", color: "yellow" },
  active: { label: "Activa", color: "green" },
  used: { label: "Sin saldo", color: "blue" },
  expired: { label: "Vencida", color: "red" },
  cancelled: { label: "Cancelada", color: "red" },
};

const EMPTY_SALE = { amount: "", buyerName: "", buyerEmail: "", buyerPhone: "", recipientName: "", recipientEmail: "", message: "", paymentNote: "Efectivo" };

const GiftCardList = () => {
  const [items, setItems] = useState([]);
  const [pendingReview, setPendingReview] = useState(0);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sale, setSale] = useState(null);
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${baseUrl}/api/gift-cards`, { headers: getAuthHeaders(), params: { status: status || undefined, q: query || undefined } });
      setItems(data.items || []);
      setPendingReview(data.pendingReview || 0);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar las tarjetas.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    axios
      .get(`${baseUrl}/api/gift-cards/settings`, { headers: getAuthHeaders() })
      .then(({ data }) => setSettings({ ...data, suggestedAmounts: (data.suggestedAmounts || []).join(", ") }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sell = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const { data } = await axios.post(`${baseUrl}/api/gift-cards`, { ...sale, amount: Number(sale.amount) }, { headers: getAuthHeaders() });
      setSale(null);
      setMessage(`Tarjeta #${data.giftCard.number} vendida: ${data.giftCard.code}${data.giftCard.recipientEmail || data.giftCard.buyerEmail ? " (se envió por correo)" : ""}.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible vender la tarjeta.");
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const payload = {
        enabled: settings.enabled,
        allowCustomAmount: settings.allowCustomAmount,
        minAmount: Number(settings.minAmount),
        maxAmount: Number(settings.maxAmount),
        validityMonths: Number(settings.validityMonths),
        suggestedAmounts: String(settings.suggestedAmounts)
          .split(",")
          .map((n) => Number(n.trim()))
          .filter((n) => n > 0),
      };
      const { data } = await axios.put(`${baseUrl}/api/gift-cards/settings`, payload, { headers: getAuthHeaders() });
      setSettings({ ...data.settings, suggestedAmounts: data.settings.suggestedAmounts.join(", ") });
      setMessage("Ajustes guardados.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar los ajustes.");
    }
  };

  const setSaleField = (field) => (e) => setSale((prev) => ({ ...prev, [field]: e.target.value }));
  const setSettingsField = (field) => (e) =>
    setSettings((prev) => ({ ...prev, [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Tarjetas de regalo</h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => setShowSettings((v) => !v)}>
            Ajustes
          </button>
          <button type="button" style={{ width: "auto" }} onClick={() => setSale(sale ? null : { ...EMPTY_SALE })}>
            Vender en mostrador
          </button>
        </div>
      </div>
      <p>
        Saldo en pesos que se usa en partes: en la tienda en línea (código al pagar), en el local (canje desde la agenda o desde el detalle de la
        tarjeta) o para pagar el anticipo de una cita. Las compradas en el sitio se activan al aprobar su comprobante.
      </p>
      {pendingReview ? (
        <p className="auth-success">
          {pendingReview} tarjeta{pendingReview === 1 ? "" : "s"} con comprobante por revisar.{" "}
          <button type="button" className="btn-secondary" style={{ width: "auto" }} onClick={() => setStatus("pending_payment")}>
            Ver
          </button>
        </p>
      ) : null}
      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      {showSettings && settings ? (
        <form onSubmit={saveSettings} style={{ maxWidth: "none", margin: "1rem 0" }}>
          <h4>Ajustes</h4>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" checked={settings.enabled} onChange={setSettingsField("enabled")} style={{ width: "auto" }} />
            Vender en el sitio (necesita una cuenta SPEI en Configurar tienda → Ventas y pagos)
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
            <label>
              Montos sugeridos (separados por coma)
              <input value={settings.suggestedAmounts} onChange={setSettingsField("suggestedAmounts")} />
            </label>
            <label>
              Monto mínimo
              <input type="number" min="1" value={settings.minAmount} onChange={setSettingsField("minAmount")} />
            </label>
            <label>
              Monto máximo
              <input type="number" min="1" value={settings.maxAmount} onChange={setSettingsField("maxAmount")} />
            </label>
            <label>
              Vigencia en meses (0 = no vence)
              <input type="number" min="0" max="60" step="1" value={settings.validityMonths} onChange={setSettingsField("validityMonths")} />
            </label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" checked={settings.allowCustomAmount} onChange={setSettingsField("allowCustomAmount")} style={{ width: "auto" }} />
            Permitir otro monto (entre el mínimo y el máximo)
          </label>
          <button type="submit" style={{ width: "auto" }}>
            Guardar ajustes
          </button>
        </form>
      ) : null}

      {sale ? (
        <form onSubmit={sell} style={{ maxWidth: "none", margin: "1rem 0" }}>
          <h4>Vender en mostrador</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
            <label>
              Monto
              <input type="number" min="1" step="1" value={sale.amount} onChange={setSaleField("amount")} required />
            </label>
            <label>
              Cómo pagó
              <input value={sale.paymentNote} onChange={setSaleField("paymentNote")} maxLength={200} placeholder="Efectivo, tarjeta…" />
            </label>
            <label>
              Quién regala
              <input value={sale.buyerName} onChange={setSaleField("buyerName")} maxLength={120} required />
            </label>
            <label>
              Su correo (opcional)
              <input type="email" value={sale.buyerEmail} onChange={setSaleField("buyerEmail")} maxLength={160} />
            </label>
            <label>
              Su teléfono (opcional)
              <PhoneInput name="buyerPhone" value={sale.buyerPhone} onChange={setSaleField("buyerPhone")} />
            </label>
            <label>
              Para quién (opcional)
              <input value={sale.recipientName} onChange={setSaleField("recipientName")} maxLength={120} />
            </label>
            <label>
              Correo de quien la recibe (opcional)
              <input type="email" value={sale.recipientEmail} onChange={setSaleField("recipientEmail")} maxLength={160} />
            </label>
          </div>
          <label>
            Mensaje (opcional)
            <textarea value={sale.message} onChange={setSaleField("message")} maxLength={300} rows={2} />
          </label>
          <small>Queda activa al momento. Si hay correo, se le envía la tarjeta en PDF; si no, imprímela desde su detalle.</small>
          <div>
            <button type="submit" style={{ width: "auto" }}>
              Vender y activar
            </button>
          </div>
        </form>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
        style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", maxWidth: "none", margin: "1rem 0" }}
      >
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "auto" }} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(GIFT_CARD_STATUS).map(([key, info]) => (
            <option key={key} value={key}>
              {info.label}
            </option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, folio, nombre o correo" style={{ flex: "1 1 220px", width: "auto" }} />
        <button type="submit" style={{ width: "auto" }}>
          Buscar
        </button>
      </form>

      {isLoading ? <p>Cargando...</p> : null}
      {!isLoading &&  !items.length ? <p>No hay tarjetas{status || query ? " con ese filtro" : " todavía"}.</p> : null}
      {items.length ? (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Código</th>
                <th>Monto</th>
                <th>Saldo</th>
                <th>Para</th>
                <th>Estado</th>
                <th>Vence</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((card) => {
                const info = GIFT_CARD_STATUS[card.status] || { label: card.status, color: "" };
                return (
                  <tr key={card._id}>
                    <td>#{card.number}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{card.status === "pending_payment" ? "—" : card.code}</td>
                    <td>{formatMxn(card.amount)}</td>
                    <td>{card.status === "pending_payment" ? "—" : formatMxn(card.balance)}</td>
                    <td>
                      {card.recipientName || card.buyerName}
                      <small style={{ display: "block", opacity: 0.7 }}>{card.source === "staff" ? "Mostrador" : "Sitio"}</small>
                    </td>
                    <td>
                      <span className={`badge badge-${info.color}`}>{info.label}</span>
                    </td>
                    <td>{card.expiresAt ? formatDay(card.expiresAt) : card.status === "pending_payment" ? "—" : "No vence"}</td>
                    <td>
                      <Link to={`/admin/gift-cards/${card._id}`}>Ver</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
};

export default GiftCardList;
