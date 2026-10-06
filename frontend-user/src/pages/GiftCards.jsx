// src/pages/GiftCards.jsx — tarjetas de regalo (módulo giftCards).
//   /tarjeta-regalo       → comprar (monto, para quién, mensaje) y consultar saldo.
//   /tarjeta-regalo/:id   → la compra: datos SPEI y comprobante mientras espera
//                           su pago; código, saldo y PDF cuando ya está activa.
//                           Es el enlace del correo de compra (?token=…, header
//                           X-Gift-Card-Token) y sirve sin cuenta.
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getAuthHeader, useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { ProofUpload, SpeiBox } from '../ui/Payment';
import { Loading, Notice, PageTitle } from '../ui/bits';
import { apiFetch, getApiBaseUrl } from '../utils/apiClient';
import { EMAIL_REGEX, errorText, fmtShortDate, folio, money } from '../utils/format';

const tokenKey = (id) => `salon.gift-card-token.${id}`;
export const rememberGiftCardToken = (id, token) => {
  try {
    if (id && token) sessionStorage.setItem(tokenKey(id), token);
  } catch {
    // sin almacenamiento
  }
};
const readToken = (id) => {
  try {
    return sessionStorage.getItem(tokenKey(id)) || '';
  } catch {
    return '';
  }
};

export const GIFT_STATUS = {
  pending_payment: 'Esperando tu pago',
  active: 'Activa',
  used: 'Sin saldo',
  expired: 'Vencida',
  cancelled: 'Cancelada',
};

const BalanceCheck = () => {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const check = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    try {
      setResult(
        await apiFetch('/api/gift-cards/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code.trim() }),
        })
      );
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <section className="card stack">
      <h2>Consulta tu saldo</h2>
      <form className="inline-form" onSubmit={check}>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GC-XXXX-XXXX" aria-label="Código de la tarjeta" />
        <button className="btn btn--small" disabled={!code.trim()}>Consultar</button>
      </form>
      {result ? (
        <p className="ok">
          Saldo de {result.code}: <strong>{money(result.balance)}</strong>
          {result.expiresAt ? ` · válida hasta el ${fmtShortDate(result.expiresAt)}` : ''}
        </p>
      ) : null}
      <Notice type="error">{error}</Notice>
    </section>
  );
};

export const GiftCardShop = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { data: settings, isLoading } = useApi('/api/gift-cards/public/settings');
  const [amount, setAmount] = useState('');
  const [custom, setCustom] = useState('');
  const [forMe, setForMe] = useState(false);
  const [form, setForm] = useState({ buyerName: '', buyerEmail: '', buyerPhone: '', recipientName: '', recipientEmail: '', message: '' });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isAuthenticated) setForm((f) => ({ ...f, buyerName: f.buyerName || user?.name || '', buyerEmail: f.buyerEmail || user?.email || '', buyerPhone: f.buyerPhone || user?.phone || '' }));
  }, [isAuthenticated, user]);
  useEffect(() => {
    if (settings?.suggestedAmounts?.length && !amount) setAmount(String(settings.suggestedAmounts[1] ?? settings.suggestedAmounts[0]));
  }, [settings, amount]);

  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const finalAmount = amount === 'otro' ? Number(custom) : Number(amount);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!(finalAmount > 0)) return setError('Elige un monto.');
    if (!form.buyerName.trim() || !EMAIL_REGEX.test(form.buyerEmail.trim())) return setError('Escribe tu nombre y un correo válido.');
    if (!forMe && form.recipientEmail && !EMAIL_REGEX.test(form.recipientEmail.trim())) return setError('El correo de quien la recibe no es válido.');
    setSending(true);
    try {
      const data = await apiFetch('/api/gift-cards/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          amount: finalAmount,
          buyerName: form.buyerName,
          buyerEmail: form.buyerEmail,
          buyerPhone: form.buyerPhone || undefined,
          recipientName: forMe ? form.buyerName : form.recipientName,
          recipientEmail: forMe ? '' : form.recipientEmail,
          message: forMe ? '' : form.message,
        }),
      });
      rememberGiftCardToken(data.giftCard._id, data.giftCardAccessToken);
      navigate(`/tarjeta-regalo/${data.giftCard._id}?nueva=1`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
    return undefined;
  };

  if (isLoading) return <div className="wrap narrow"><Loading /></div>;

  return (
    <div className="wrap narrow">
      <PageTitle title="Tarjetas de regalo" subtitle="Regala un momento de belleza: se usa en el salón y en la tienda en línea, en partes hasta agotar el saldo." />
      {!settings?.available ? (
        <p className="notice">Por ahora no vendemos tarjetas en línea; pídela en el salón.</p>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <h2>Monto</h2>
          <div className="chips">
            {settings.suggestedAmounts.map((n) => (
              <button type="button" key={n} className={`chip ${amount === String(n) ? 'is-active' : ''}`} onClick={() => setAmount(String(n))}>
                {money(n)}
              </button>
            ))}
            {settings.allowCustomAmount ? (
              <button type="button" className={`chip ${amount === 'otro' ? 'is-active' : ''}`} onClick={() => setAmount('otro')}>Otro monto</button>
            ) : null}
          </div>
          {amount === 'otro' ? (
            <label>
              Monto (de {money(settings.minAmount)} a {money(settings.maxAmount)})
              <input type="number" min={settings.minAmount} max={settings.maxAmount} step="1" value={custom} onChange={(e) => setCustom(e.target.value)} />
            </label>
          ) : null}

          <h2>Tus datos</h2>
          <div className="form-grid">
            <label>Tu nombre<input name="buyerName" value={form.buyerName} onChange={onField} maxLength={120} /></label>
            <label>Tu correo<input name="buyerEmail" type="email" value={form.buyerEmail} onChange={onField} maxLength={160} /></label>
            <label>Teléfono (opcional)<input name="buyerPhone" type="tel" value={form.buyerPhone} onChange={onField} /></label>
          </div>
          <label className="check-inline"><input type="checkbox" checked={forMe} onChange={(e) => setForMe(e.target.checked)} /> Es para mí</label>
          {!forMe ? (
            <>
              <h2>Para quién</h2>
              <div className="form-grid">
                <label>Nombre<input name="recipientName" value={form.recipientName} onChange={onField} maxLength={120} /></label>
                <label>Su correo (opcional)<input name="recipientEmail" type="email" value={form.recipientEmail} onChange={onField} maxLength={160} placeholder="Si lo dejas vacío, te la mandamos a ti" /></label>
                <label className="wide">Mensaje (opcional)<textarea name="message" rows="2" maxLength={300} value={form.message} onChange={onField} /></label>
              </div>
            </>
          ) : null}
          <p className="muted small">
            Pagas por transferencia y subes tu comprobante; en cuanto lo validemos la enviamos por correo con su código y en PDF.
            {settings.validityMonths ? ` Vigencia: ${settings.validityMonths} meses desde que se activa.` : ''}
          </p>
          <Notice type="error">{error}</Notice>
          <button className="btn btn--block" disabled={sending}>{sending ? 'Apartando…' : `Comprar tarjeta de ${money(finalAmount || 0)}`}</button>
        </form>
      )}
      <BalanceCheck />
    </div>
  );
};

export const GiftCardPurchase = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [token] = useState(() => {
    const fromUrl = params.get('token') || '';
    if (fromUrl) rememberGiftCardToken(id, fromUrl);
    return fromUrl || readToken(id);
  });
  const [isNew, setIsNew] = useState(Boolean(params.get('nueva')));
  const [card, setCard] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('token') || url.searchParams.has('nueva')) {
      url.searchParams.delete('token');
      url.searchParams.delete('nueva');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const headers = useCallback(() => (token ? { 'X-Gift-Card-Token': token } : getAuthHeader()), [token]);
  const load = useCallback(async () => {
    try {
      setCard((await apiFetch(`/api/gift-cards/public/${id}`, { headers: headers() })).giftCard);
    } catch (err) {
      setLoadError([401, 403].includes(err.status) ? 'Este enlace ya no es válido. Inicia sesión para ver tus tarjetas.' : err.status === 404 ? 'No encontramos esta tarjeta.' : errorText(err));
    }
  }, [id, headers]);
  useEffect(() => {
    load();
  }, [load]);

  const openPdf = async () => {
    const res = await fetch(`${getApiBaseUrl()}/api/gift-cards/public/${id}/pdf`, { headers: headers() });
    if (res.ok) window.open(URL.createObjectURL(await res.blob()), '_blank');
  };

  if (loadError) {
    return (
      <div className="wrap narrow">
        <Notice type="error">{loadError}</Notice>
        <Link className="btn" to="/login">Iniciar sesión</Link>
      </div>
    );
  }
  if (!card) return <div className="wrap narrow"><Loading /></div>;

  const active = ['active', 'used', 'expired'].includes(card.status);
  return (
    <div className="wrap narrow">
      <header className="page-title">
        <h1>Tarjeta de regalo {folio('TR', card.number)}</h1>
        <span className={`status status--${card.status === 'active' ? 'confirmed' : card.status === 'pending_payment' ? 'pending' : 'cancelled'}`}>{GIFT_STATUS[card.status]}</span>
      </header>
      {isNew ? <Notice type="success">Tu tarjeta quedó apartada. Transfiere el monto y sube tu comprobante para activarla.</Notice> : null}

      <section className="card gift-card">
        <p className="muted">Tarjeta de regalo</p>
        <p className="gift-card__amount">{money(card.amount)}</p>
        <p>Para: <strong>{card.recipientName || card.buyerName}</strong>{card.recipientEmail ? ` (${card.recipientEmail})` : ''}</p>
        {card.message ? <p className="muted">“{card.message}”</p> : null}
        {active ? (
          <>
            <p className="gift-card__code">{card.code}</p>
            <p>Saldo: <strong>{money(card.balance)}</strong>{card.expiresAt ? ` · válida hasta el ${fmtShortDate(card.expiresAt)}` : ''}</p>
            <button type="button" className="btn btn--ghost btn--small" onClick={openPdf}><i className="fa-regular fa-file-pdf" aria-hidden="true" /> Descargar PDF</button>
          </>
        ) : null}
      </section>

      {card.status === 'pending_payment' ? (
        <section className="card stack">
          <h2>Datos para transferir</h2>
          <SpeiBox spei={card.payment?.spei} amount={card.amount} concept={card.payment?.concept} />
          <h2>Tu comprobante</h2>
          <ProofUpload
            proofs={card.paymentProofs}
            canUpload={card.canUploadProof}
            uploadPath={`/api/gift-cards/public/${id}/payment-proof`}
            headers={headers}
            onUploaded={(data) => {
              setIsNew(false);
              if (data.giftCard) setCard(data.giftCard);
            }}
          />
        </section>
      ) : null}

      <p><Link to="/tarjeta-regalo">← Tarjetas de regalo</Link></p>
    </div>
  );
};
