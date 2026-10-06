// src/pages/Account.jsx — "Mi cuenta" (?tab=…):
//   puntos   → saldo de puntos y tarjeta de sellos (GET /api/loyalty/me)
//   citas    → próximas y pasadas (GET /api/appointments/mine)
//   pedidos  → GET /api/orders/mine
//   favoritos→ User.favorites (aviso de "volvió a estar disponible")
//   resenas  → GET /api/reviews/mine
//   datos    → nombre, teléfono, correos opcionales (carrito abandonado,
//              favoritos disponibles), direcciones y contraseña
import React, { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { getAuthHeader, useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { useFavorites } from '../hooks/useFavorites';
import { Loading, Notice, PageTitle, Stars } from '../ui/bits';
import { apiFetch } from '../utils/apiClient';
import { EMPTY_SAVED_ADDRESS, SHIPPING_ADDRESS_FIELDS } from '../utils/address';
import { APPOINTMENT_STATUS, ORDER_STATUS, errorText, fmtShortDate, fmtTime, folio, mediaUrl, money } from '../utils/format';
import { listItems } from '../utils/products';

const TABS = [
  ['puntos', 'Puntos y sellos'],
  ['citas', 'Mis citas'],
  ['pedidos', 'Mis pedidos'],
  ['favoritos', 'Favoritos'],
  ['resenas', 'Mis reseñas'],
  ['tarjetas', 'Tarjetas de regalo'],
  ['datos', 'Mis datos'],
];

const LEDGER_REASON = {
  earn: 'Ganados',
  redeem: 'Usados en pedido',
  refund: 'Devueltos',
  reverse: 'Revertidos',
  expire: 'Vencidos',
  adjust: 'Ajuste',
  reward: 'Premio ganado',
  reward_redeemed: 'Premio canjeado',
};

const Loyalty = () => {
  const { data, error, isLoading } = useApi('/api/loyalty/me', getAuthHeader());
  if (isLoading) return <Loading />;
  if (error) return <Notice type="error">{errorText(error)}</Notice>;
  const { programs = {}, account = {}, ledger = [] } = data || {};
  if (!programs.points?.enabled && !programs.stamps?.enabled) return <p className="muted">Por ahora no tenemos programa de lealtad.</p>;
  const goal = programs.stamps?.goal || 0;
  return (
    <div className="stack">
      <div className="grid grid--2">
        {programs.points?.enabled ? (
          <section className="card loyalty-card">
            <h3><i className="fa-solid fa-coins" aria-hidden="true" /> Puntos</h3>
            <p className="big">{money(account.points)}</p>
            <small className="muted">
              Ganas el {programs.points.earnPercent}% de cada compra pagada; 1 punto = $1 en tu próximo pedido.
              {account.pointsExpireAt ? ` Vencen el ${fmtShortDate(account.pointsExpireAt)}.` : ''}
            </small>
          </section>
        ) : null}
        {programs.stamps?.enabled ? (
          <section className="card loyalty-card">
            <h3><i className="fa-solid fa-stamp" aria-hidden="true" /> Tarjeta de sellos</h3>
            <div className="stamps" aria-label={`${account.stamps} de ${goal} sellos`}>
              {Array.from({ length: goal }, (_, i) => (
                <span key={i} className={i < (account.stamps || 0) ? 'is-on' : ''}><i className="fa-solid fa-spa" aria-hidden="true" /></span>
              ))}
            </div>
            <small className="muted">Cada cita completada suma un sello. Al juntar {goal}: {programs.stamps.reward}.</small>
            {account.rewardsAvailable ? <p className="ok">Tienes {account.rewardsAvailable} premio{account.rewardsAvailable > 1 ? 's' : ''} para usar en tu próxima visita.</p> : null}
          </section>
        ) : null}
      </div>
      {ledger.length ? (
        <section className="card">
          <h3>Movimientos</h3>
          <ul className="lines">
            {ledger.map((m) => (
              <li key={m._id}>
                <span>{fmtShortDate(m.createdAt)} · {LEDGER_REASON[m.reason] || m.reason}{m.program === 'stamps' ? ' (sellos)' : ''}{m.note ? ` — ${m.note}` : ''}</span>
                <span>{m.delta > 0 ? '+' : ''}{m.program === 'points' ? money(m.delta) : m.delta}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};

const Appointments = () => {
  const upcoming = useApi('/api/appointments/mine?scope=upcoming', getAuthHeader());
  const past = useApi('/api/appointments/mine?scope=past', getAuthHeader());
  const row = (a) => (
    <li key={a._id} className="card row-card">
      <div>
        <strong>{fmtShortDate(a.start, a.timezone)} · {fmtTime(a.start, a.timezone)}</strong>
        <small className="muted">{a.services.map((s) => s.name).join(', ')}{a.specialist?.name ? ` · ${a.specialist.name}` : ''}</small>
      </div>
      <span className={`status status--${a.status}`}>{APPOINTMENT_STATUS[a.status]}</span>
      <Link to={`/cita/${a._id}${a.status === 'completed' ? '?accion=calificar' : ''}`}>{a.status === 'completed' ? 'Calificar / ver' : 'Ver'}</Link>
    </li>
  );
  return (
    <div className="stack">
      <h3>Próximas</h3>
      {upcoming.isLoading ? <Loading /> : null}
      {!upcoming.isLoading && !listItems(upcoming.data).length ? <p className="muted">No tienes citas próximas. <Link to="/agendar">Agenda una</Link>.</p> : null}
      <ul className="plain stack">{listItems(upcoming.data).map(row)}</ul>
      <h3>Anteriores</h3>
      {!past.isLoading && !listItems(past.data).length ? <p className="muted">Aún no hay citas anteriores.</p> : null}
      <ul className="plain stack">{listItems(past.data).map(row)}</ul>
    </div>
  );
};

const Orders = () => {
  const { data, isLoading, error } = useApi('/api/orders/mine', getAuthHeader());
  const items = listItems(data);
  if (isLoading) return <Loading />;
  if (error) return <Notice type="error">{errorText(error)}</Notice>;
  if (!items.length) return <p className="muted">Aún no tienes pedidos. <Link to="/tienda">Ir a la tienda</Link>.</p>;
  return (
    <ul className="plain stack">
      {items.map((o) => (
        <li key={o._id} className="card row-card">
          <div>
            <strong>{folio('PED', o.orderNumber)} · {money(o.total)}</strong>
            <small className="muted">{fmtShortDate(o.createdAt)} · {o.items.length} producto{o.items.length === 1 ? '' : 's'}</small>
          </div>
          <span className={`status status--${o.status}`}>{ORDER_STATUS[o.status] || o.status}</span>
          <Link to={`/pedido/${o._id}`}>Ver</Link>
        </li>
      ))}
    </ul>
  );
};

const Favorites = () => {
  const { items, toggle } = useFavorites();
  if (!items.length) return <p className="muted">Toca el <i className="fa-regular fa-heart" aria-hidden="true" /> en la tienda para guardar productos. Si alguno se agota, te avisamos cuando regrese.</p>;
  return (
    <ul className="plain stack">
      {items.map((p) => (
        <li key={p._id} className="card row-card">
          {p.images?.[0] ? <img className="row-card__img" src={mediaUrl(p.images[0])} alt="" /> : null}
          <div>
            <Link to={`/tienda/${p._id}`}><strong>{p.name}</strong></Link>
            <small className="muted">{money(p.price)}{p.category?.name ? ` · ${p.category.name}` : ''}</small>
          </div>
          <button type="button" className="link-btn" onClick={() => toggle(p._id)}>Quitar</button>
        </li>
      ))}
    </ul>
  );
};

const REVIEW_STATUS = { pending: 'En revisión', approved: 'Publicada', rejected: 'No publicada' };

// Tarjetas de regalo que compré (con enlace a la compra) y las que me regalaron.
const GIFT_STATUS_LABEL = { pending_payment: 'Esperando pago', active: 'Activa', used: 'Sin saldo', expired: 'Vencida', cancelled: 'Cancelada' };
const MyGiftCards = () => {
  const { data, isLoading } = useApi('/api/gift-cards/mine', getAuthHeader());
  const items = listItems(data);
  if (isLoading) return <Loading />;
  if (!items.length) return <p className="muted">Aún no tienes tarjetas de regalo. <Link to="/tarjeta-regalo">Regala una</Link>.</p>;
  return (
    <ul className="plain stack">
      {items.map((c) => (
        <li key={c._id} className="card row-card">
          <div>
            <strong>{money(c.amount)} · {c.role === 'received' ? `De ${c.buyerName}` : `Para ${c.recipientName || 'ti'}`}</strong>
            <small className="muted">
              {c.code ? `${c.code} · saldo ${money(c.balance)}` : 'Se activa al validar el pago'}
              {c.expiresAt ? ` · vence ${fmtShortDate(c.expiresAt)}` : ''}
            </small>
          </div>
          <span className="tag">{GIFT_STATUS_LABEL[c.status] || c.status}</span>
          {c.role === 'bought' ? <Link to={`/tarjeta-regalo/${c._id}`}>Ver</Link> : null}
        </li>
      ))}
    </ul>
  );
};

// Reseñas de productos y calificaciones de citas (GET /api/reviews/mine:
// `kind` "product" | "appointment"; las de cita se buscan por cuenta o por
// correo, así salen también las que dejó desde el enlace del correo).
const reviewTitle = (r) => {
  if (r.kind === 'appointment') {
    const services = r.appointment?.services || [];
    return `Cita${r.appointment?.appointmentNumber ? ` #${r.appointment.appointmentNumber}` : ''}${services.length ? `: ${services.join(' + ')}` : ''}`;
  }
  return r.productName || 'Producto';
};

const MyReviews = () => {
  const { data, isLoading } = useApi('/api/reviews/mine', getAuthHeader());
  const items = listItems(data);
  if (isLoading) return <Loading />;
  if (!items.length) return <p className="muted">Cuando recibas un pedido o termines una cita podrás calificarlos.</p>;
  return (
    <ul className="plain stack">
      {items.map((r) => (
        <li key={r._id} className="card row-card">
          <div>
            <strong>{reviewTitle(r)}</strong>
            <Stars value={r.rating} />
            {r.comment ? <p>{r.comment}</p> : null}
            <small className="muted">
              {r.kind === 'appointment' && r.appointment?.start ? `Cita del ${fmtShortDate(r.appointment.start)} · ` : ''}
              Calificada el {fmtShortDate(r.createdAt)}
              {r.rejectionReason ? ` · ${r.rejectionReason}` : ''}
            </small>
          </div>
          <span className="tag">{REVIEW_STATUS[r.status]}</span>
          {r.kind === 'appointment' && r.appointment?._id ? (
            <Link to={`/cita/${r.appointment._id}`}>Ver cita</Link>
          ) : r.product ? (
            <Link to={`/tienda/${r.product}`}>Ver producto</Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
};

const Profile = () => {
  const { user, token, updateUser } = useAuth();
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const [form, setForm] = useState({ name: user.name || '', phone: user.phone || '', abandonedCart: true, wishlist: true });
  const [addresses, setAddresses] = useState([]);
  const [newAddress, setNewAddress] = useState(null);
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState({ type: 'info', text: '' });

  useEffect(() => {
    apiFetch(`/api/users/${user._id}`, { headers: auth })
      .then((u) => {
        setForm({ name: u.name || '', phone: u.phone || '', abandonedCart: u.emailPreferences?.abandonedCart !== false, wishlist: u.emailPreferences?.wishlist !== false });
        setAddresses(u.addresses || []);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user._id]);

  const run = async (fn, ok) => {
    setMsg({ type: 'info', text: '' });
    try {
      await fn();
      setMsg({ type: 'success', text: ok });
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) });
    }
  };

  const saveProfile = (e) => {
    e.preventDefault();
    run(async () => {
      const data = await apiFetch(`/api/users/${user._id}`, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({ name: form.name, phone: form.phone || undefined, emailPreferences: { abandonedCart: form.abandonedCart, wishlist: form.wishlist } }),
      });
      updateUser({ name: data.user.name, phone: data.user.phone });
    }, 'Guardamos tus datos.');
  };

  const addAddress = (e) => {
    e.preventDefault();
    run(async () => {
      const data = await apiFetch(`/api/users/${user._id}/addresses`, { method: 'POST', headers: auth, body: JSON.stringify(newAddress) });
      setAddresses(data.user?.addresses || []);
      setNewAddress(null);
    }, 'Dirección guardada.');
  };

  const deleteAddress = (id) =>
    run(async () => {
      const data = await apiFetch(`/api/users/${user._id}/addresses/${id}`, { method: 'DELETE', headers: auth });
      setAddresses(data.user?.addresses || []);
    }, 'Dirección eliminada.');

  const changePassword = (e) => {
    e.preventDefault();
    run(async () => {
      await apiFetch(`/api/users/${user._id}/password`, { method: 'PATCH', headers: auth, body: JSON.stringify(pwd) });
      setPwd({ currentPassword: '', newPassword: '' });
    }, 'Contraseña actualizada.');
  };

  return (
    <div className="stack">
      <Notice type={msg.type}>{msg.text}</Notice>
      <form className="card stack" onSubmit={saveProfile}>
        <h3>Datos</h3>
        <div className="form-grid">
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Teléfono<input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Correo<input value={user.email} readOnly /></label>
        </div>
        <h3>Correos que quiero recibir</h3>
        <label className="check-inline"><input type="checkbox" checked={form.abandonedCart} onChange={(e) => setForm({ ...form, abandonedCart: e.target.checked })} /> Recordatorio si dejo productos en el carrito</label>
        <label className="check-inline"><input type="checkbox" checked={form.wishlist} onChange={(e) => setForm({ ...form, wishlist: e.target.checked })} /> Avisarme cuando un favorito agotado vuelva a estar disponible</label>
        <button className="btn">Guardar</button>
      </form>

      <section className="card stack">
        <h3>Direcciones</h3>
        <ul className="plain stack">
          {addresses.map((a) => (
            <li key={a._id} className="row-card">
              <div>
                <strong>{a.label || 'Dirección'}{a.isDefault ? ' · principal' : ''}</strong>
                <small className="muted">{a.street} {a.exteriorNumber}{a.interiorNumber ? ` int. ${a.interiorNumber}` : ''}, {a.neighborhood}, {a.city}, {a.state} {a.zipCode}</small>
              </div>
              <button type="button" className="link-btn" onClick={() => deleteAddress(a._id)}>Eliminar</button>
            </li>
          ))}
        </ul>
        {newAddress ? (
          <form className="stack" onSubmit={addAddress}>
            <div className="form-grid">
              <label>Nombre de la dirección<input value={newAddress.label} placeholder="Casa, oficina…" onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })} /></label>
              {SHIPPING_ADDRESS_FIELDS.map((f) => (
                <label key={f.name} className={f.wide ? 'wide' : ''}>
                  {f.label}
                  <input value={newAddress[f.name]} maxLength={f.maxLength} required={f.required} onChange={(e) => setNewAddress({ ...newAddress, [f.name]: e.target.value })} />
                </label>
              ))}
            </div>
            <label className="check-inline"><input type="checkbox" checked={newAddress.isDefault} onChange={(e) => setNewAddress({ ...newAddress, isDefault: e.target.checked })} /> Usar como principal</label>
            <div className="row">
              <button className="btn">Guardar dirección</button>
              <button type="button" className="btn btn--ghost" onClick={() => setNewAddress(null)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setNewAddress({ ...EMPTY_SAVED_ADDRESS })}>Agregar dirección</button>
        )}
      </section>

      <form className="card stack" onSubmit={changePassword}>
        <h3>Contraseña</h3>
        <div className="form-grid">
          <label>Actual<input type="password" autoComplete="current-password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} required /></label>
          <label>Nueva<input type="password" autoComplete="new-password" minLength={6} value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} required /></label>
        </div>
        <button className="btn btn--ghost">Cambiar contraseña</button>
      </form>
    </div>
  );
};

const PANELS = { puntos: Loyalty, citas: Appointments, pedidos: Orders, favoritos: Favorites, resenas: MyReviews, tarjetas: MyGiftCards, datos: Profile };

const Account = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = PANELS[params.get('tab')] ? params.get('tab') : 'puntos';
  if (!isAuthenticated) return <Navigate to="/login?volver=/cuenta" replace />;
  const Panel = PANELS[tab];
  return (
    <div className="wrap">
      <PageTitle title={`Hola, ${user.name?.split(' ')[0] || ''}`} />
      <div className="account">
        <nav className="account__tabs">
          {TABS.map(([key, label]) => (
            <button type="button" key={key} className={tab === key ? 'is-active' : ''} onClick={() => setParams({ tab: key })}>{label}</button>
          ))}
          <button type="button" onClick={logout}>Cerrar sesión</button>
        </nav>
        <div className="account__panel"><Panel /></div>
      </div>
    </div>
  );
};

export default Account;
