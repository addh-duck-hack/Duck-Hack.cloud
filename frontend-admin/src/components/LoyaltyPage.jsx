import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatDateTime } from "../utils/schedule";

// Lealtad (módulo "loyalty", packages/core-api/modules/loyalty.js): dos
// programas con su propio interruptor — puntos por compra pagada (1 punto =
// $1, canjeables en el checkout) y tarjeta de sellos por cita completada con un
// beneficio que se canjea en el local. Aquí: ajustes, buscador de clientes y
// la cuenta de cada uno (historial, ajuste manual y "Canjear beneficio").

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const formatDate = (value) => (value ? new Date(value).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "");

const REASON_LABELS = {
  earn: "Compra pagada",
  redeem: "Usados en compra",
  refund: "Devueltos (pedido cancelado)",
  reverse: "Retirados (pedido cancelado)",
  expire: "Vencidos",
  adjust: "Ajuste manual",
  reward: "Tarjeta completa",
  reward_redeemed: "Beneficio canjeado",
};

const toForm = (s) => ({
  pointsEnabled: s.points.enabled,
  earnPercent: String(s.points.earnPercent),
  maxRedeemPercent: String(s.points.maxRedeemPercent),
  minRedeem: String(s.points.minRedeem),
  expiryMonths: s.points.expiryMonths == null ? "" : String(s.points.expiryMonths),
  expiryWarningDays: String(s.points.expiryWarningDays),
  stampsEnabled: s.stamps.enabled,
  goal: String(s.stamps.goal),
  reward: s.stamps.reward,
});

const formatDelta = (entry) => {
  if (entry.program === "points") return `${entry.delta > 0 ? "+" : "−"}${formatMxn(Math.abs(entry.delta))}`;
  if (entry.reason === "reward") return "+1 beneficio";
  if (entry.reason === "reward_redeemed") return "−1 beneficio";
  return `${entry.delta > 0 ? "+" : "−"}${Math.abs(entry.delta)} sello${Math.abs(entry.delta) === 1 ? "" : "s"}`;
};

const LoyaltyPage = () => {
  const [form, setForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [account, setAccount] = useState(null);
  const [adjust, setAdjust] = useState({ program: "points", delta: "", note: "" });
  const [accountError, setAccountError] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const baseUrl = getApiBaseUrl();
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  const errorOf = (err, fallback) => err.response?.data?.error?.message || fallback;

  const search = async (q = query) => {
    try {
      const { data } = await axios.get(`${baseUrl}/api/loyalty/accounts`, { headers, params: q.trim() ? { q: q.trim() } : {} });
      setResults(data.items);
    } catch (err) {
      setError(errorOf(err, "No fue posible buscar clientes."));
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${baseUrl}/api/loyalty/settings`, { headers });
        setForm(toForm(data));
        await search("");
      } catch (err) {
        setError(errorOf(err, "No fue posible cargar la información."));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setMessage("");
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const { data } = await axios.put(
        `${baseUrl}/api/loyalty/settings`,
        {
          points: {
            enabled: form.pointsEnabled,
            earnPercent: Number(form.earnPercent),
            maxRedeemPercent: Number(form.maxRedeemPercent),
            minRedeem: Number(form.minRedeem || 0),
            expiryMonths: form.expiryMonths === "" ? null : Number(form.expiryMonths),
            expiryWarningDays: Number(form.expiryWarningDays),
          },
          stamps: { enabled: form.stampsEnabled, goal: Number(form.goal), reward: form.reward },
        },
        { headers: { ...headers, "Content-Type": "application/json" } }
      );
      setForm(toForm(data.settings));
      setMessage(data.message || "Ajustes guardados.");
    } catch (err) {
      setError(errorOf(err, "No fue posible guardar los ajustes."));
    } finally {
      setIsSaving(false);
    }
  };

  const openAccount = async (customerId) => {
    setAccountError("");
    setAccountMessage("");
    setAdjust({ program: "points", delta: "", note: "" });
    try {
      const { data } = await axios.get(`${baseUrl}/api/loyalty/accounts/${customerId}`, { headers });
      setAccount(data);
    } catch (err) {
      setAccountError(errorOf(err, "No fue posible cargar la cuenta."));
    }
  };

  const afterAccountChange = (data) => {
    setAccount(data.account);
    setAccountMessage(data.message);
    setResults((prev) =>
      prev.map((r) =>
        String(r.customer._id) === String(data.account.customer._id)
          ? { ...r, points: data.account.points, stamps: data.account.stamps, rewardsAvailable: data.account.rewardsAvailable }
          : r
      )
    );
  };

  const handleAdjust = async (event) => {
    event.preventDefault();
    setIsBusy(true);
    setAccountError("");
    setAccountMessage("");
    try {
      const { data } = await axios.post(
        `${baseUrl}/api/loyalty/accounts/${account.customer._id}/adjust`,
        { program: adjust.program, delta: Number(adjust.delta), note: adjust.note },
        { headers: { ...headers, "Content-Type": "application/json" } }
      );
      afterAccountChange(data);
      setAdjust((prev) => ({ ...prev, delta: "", note: "" }));
    } catch (err) {
      setAccountError(errorOf(err, "No fue posible guardar el ajuste."));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRedeemReward = async () => {
    setIsBusy(true);
    setAccountError("");
    setAccountMessage("");
    try {
      const { data } = await axios.post(`${baseUrl}/api/loyalty/accounts/${account.customer._id}/redeem-reward`, {}, { headers });
      afterAccountChange(data);
    } catch (err) {
      setAccountError(errorOf(err, "No fue posible canjear el beneficio."));
    } finally {
      setIsBusy(false);
    }
  };

  if (!form) return error ? <div className="auth-error">{error}</div> : <p>Cargando...</p>;

  return (
    <section style={{ maxWidth: 1100 }}>
      <h3 style={{ marginTop: 0 }}>Lealtad</h3>
      <p>
        Dos programas, cada uno con su interruptor: <strong>puntos</strong> por compra pagada (1 punto = $1, se usan como descuento en el
        checkout) y <strong>tarjeta de sellos</strong> por cita completada, con un beneficio que se canjea en el local.
      </p>

      {error ? <div className="auth-error">{error}</div> : null}
      {message ? <div className="auth-success">{message}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <fieldset>
          <legend>Puntos por compra</legend>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="pointsEnabled" checked={form.pointsEnabled} onChange={handleChange} style={{ width: "auto" }} />
            Activar puntos
          </label>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
            <label>
              Ganan (% de la compra)
              <input type="number" name="earnPercent" min="0.1" max="50" step="0.1" value={form.earnPercent} onChange={handleChange} required disabled={!form.pointsEnabled} />
            </label>
            <label>
              Pueden pagar hasta (% de la compra)
              <input type="number" name="maxRedeemPercent" min="1" max="100" step="1" value={form.maxRedeemPercent} onChange={handleChange} required disabled={!form.pointsEnabled} />
            </label>
            <label>
              Mínimo para usarlos ($)
              <input type="number" name="minRedeem" min="0" step="1" value={form.minRedeem} onChange={handleChange} disabled={!form.pointsEnabled} />
            </label>
            <label>
              Vencen tras meses sin movimiento
              <input type="number" name="expiryMonths" min="1" max="60" step="1" value={form.expiryMonths} onChange={handleChange} placeholder="Nunca" disabled={!form.pointsEnabled} />
            </label>
            <label>
              Avisar días antes de vencer
              <input
                type="number"
                name="expiryWarningDays"
                min="1"
                max="60"
                step="1"
                value={form.expiryWarningDays}
                onChange={handleChange}
                required
                disabled={!form.pointsEnabled || form.expiryMonths === ""}
              />
            </label>
          </div>
          <small>
            Se abonan cuando el pedido se paga (sobre los productos, ya con cupón y sin envío) y se retiran si se cancela. Vacío en
            "vencen" = nunca vencen.
          </small>
        </fieldset>

        <fieldset style={{ marginTop: "0.75rem" }}>
          <legend>Tarjeta de sellos</legend>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="stampsEnabled" checked={form.stampsEnabled} onChange={handleChange} style={{ width: "auto" }} />
            Activar tarjeta de sellos
          </label>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "0.75rem" }}>
            <label>
              Sellos para completarla
              <input type="number" name="goal" min="2" max="50" step="1" value={form.goal} onChange={handleChange} required disabled={!form.stampsEnabled} />
            </label>
            <label>
              Beneficio al completarla
              <input type="text" name="reward" maxLength="120" value={form.reward} onChange={handleChange} required disabled={!form.stampsEnabled} />
            </label>
          </div>
          <small>Cada cita marcada como "Completada" suma un sello. Al llegar a la meta la clienta recibe un correo con su beneficio.</small>
        </fieldset>

        <button type="submit" disabled={isSaving} style={{ width: "auto", marginTop: "1rem" }}>
          {isSaving ? "Guardando..." : "Guardar"}
        </button>
      </form>

      <h4 style={{ marginTop: "2rem" }}>Clientes</h4>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
        style={{ maxWidth: "none", margin: 0, display: "flex", gap: "0.5rem", alignItems: "flex-end" }}
      >
        <label style={{ flex: 1, margin: 0 }}>
          Buscar por nombre o correo
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Vacío = los de más saldo" />
        </label>
        <button type="submit" style={{ width: "auto" }}>
          Buscar
        </button>
      </form>

      <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Puntos</th>
              <th>Sellos</th>
              <th>Beneficios</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={5}>{query.trim() ? "Sin resultados." : "Todavía nadie tiene saldo."}</td>
              </tr>
            ) : (
              results.map((r) => (
                <tr key={r.customer._id}>
                  <td>
                    {r.customer.name}
                    <small style={{ display: "block", opacity: 0.75 }}>{r.customer.email}</small>
                  </td>
                  <td>{formatMxn(r.points)}</td>
                  <td>{r.stamps}</td>
                  <td>{r.rewardsAvailable ? <span className="badge badge-green">{r.rewardsAvailable}</span> : "—"}</td>
                  <td>
                    <button type="button" onClick={() => openAccount(r.customer._id)} style={{ width: "auto" }}>
                      Ver cuenta
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {account ? (
        <div style={{ marginTop: "1.5rem", padding: "1rem", border: "1px solid var(--input-border-color)", borderRadius: 10, background: "var(--form-background-color)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h4 style={{ margin: 0 }}>{account.customer.name}</h4>
              <small style={{ opacity: 0.75 }}>{account.customer.email}</small>
            </div>
            <button type="button" onClick={() => setAccount(null)} style={{ width: "auto" }}>
              Cerrar
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", margin: "1rem 0" }}>
            <div>
              <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>Puntos</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{formatMxn(account.points)}</div>
              {account.pointsExpireAt ? <small style={{ opacity: 0.75 }}>Vencen el {formatDate(account.pointsExpireAt)}</small> : null}
            </div>
            <div>
              <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>Sellos</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>
                {account.stamps} / {account.goal}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>Beneficios disponibles</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{account.rewardsAvailable}</div>
              {account.rewardsAvailable ? (
                <button type="button" onClick={handleRedeemReward} disabled={isBusy} style={{ width: "auto", marginTop: 4 }}>
                  Canjear "{account.reward}"
                </button>
              ) : null}
            </div>
          </div>

          {accountError ? <div className="auth-error">{accountError}</div> : null}
          {accountMessage ? <div className="auth-success">{accountMessage}</div> : null}

          <form onSubmit={handleAdjust} style={{ maxWidth: "none", margin: 0 }}>
            <div className="form-row" style={{ display: "grid", gridTemplateColumns: "160px 140px 1fr auto", gap: "0.75rem", alignItems: "end" }}>
              <label>
                Ajustar
                <select value={adjust.program} onChange={(event) => setAdjust((prev) => ({ ...prev, program: event.target.value }))}>
                  <option value="points">Puntos ($)</option>
                  <option value="stamps">Sellos</option>
                </select>
              </label>
              <label>
                Cantidad (+/−)
                <input
                  type="number"
                  step={adjust.program === "points" ? "0.01" : "1"}
                  value={adjust.delta}
                  onChange={(event) => setAdjust((prev) => ({ ...prev, delta: event.target.value }))}
                  required
                />
              </label>
              <label>
                Motivo
                <input type="text" maxLength="200" value={adjust.note} onChange={(event) => setAdjust((prev) => ({ ...prev, note: event.target.value }))} required />
              </label>
              <button type="submit" disabled={isBusy || !Number(adjust.delta)} style={{ width: "auto" }}>
                Guardar ajuste
              </button>
            </div>
          </form>

          <h5 style={{ marginBottom: "0.5rem" }}>Historial</h5>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th>Cantidad</th>
                  <th>Saldo</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {account.ledger.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Sin movimientos.</td>
                  </tr>
                ) : (
                  account.ledger.map((entry) => (
                    <tr key={entry._id}>
                      <td>{formatDateTime(entry.createdAt)}</td>
                      <td>{REASON_LABELS[entry.reason] || entry.reason}</td>
                      <td style={{ color: entry.delta < 0 || entry.reason === "reward_redeemed" ? "var(--danger-color, #c0392b)" : undefined }}>{formatDelta(entry)}</td>
                      <td>{entry.program === "points" ? formatMxn(entry.balanceAfter) : entry.reason === "reward_redeemed" ? "—" : `${entry.balanceAfter} sellos`}</td>
                      <td>
                        {entry.note || "—"}
                        {entry.by?.name ? <small style={{ display: "block", opacity: 0.75 }}>Por {entry.by.name}</small> : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default LoyaltyPage;
