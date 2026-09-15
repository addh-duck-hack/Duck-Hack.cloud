// src/components/MiCuenta.jsx — panel de cuenta del cliente: datos
// personales, dirección guardada, historial de pedidos y favoritos.
//
// Requiere sesión (useAuth.jsx) — sin ella, redirige a /login. Los datos
// completos (incluyendo favorites poblado) se cargan aparte con
// GET /api/users/:id porque lo que trae auth.user (de /login) no incluye el
// populate de favoritos ni necesariamente el address/phone más reciente.
import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useAuth } from '../hooks/useAuth';
import { resolveStoreImageUrl } from '../hooks/useStoreConfig';
import { apiFetch } from '../utils/apiClient';
import { formatMxn, formatMxnLong } from '../hooks/useCart';
import { iconForCategory } from './BrandMarks';
import './Auth.css';
import './MiCuenta.css';

const ORDER_STATUS_LABELS = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  processing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// Menú lateral en vez de todo apilado en una sola pantalla — cada entrada
// muestra un solo panel a la vez (ver `activeSection` más abajo).
const SECTIONS = [
  { id: 'datos', label: 'Mis datos', icon: 'fa-user' },
  { id: 'password', label: 'Contraseña', icon: 'fa-lock' },
  { id: 'direcciones', label: 'Mis direcciones', icon: 'fa-map-marker-alt' },
  { id: 'pedidos', label: 'Mis pedidos', icon: 'fa-box' },
  { id: 'favoritos', label: 'Mi lista de deseos', icon: 'fa-heart' },
];

const MiCuenta = () => {
  usePageMeta('Mi cuenta');
  const navigate = useNavigate();
  const auth = useAuth();
  const userId = auth.user?._id;
  const authHeader = auth.token ? { Authorization: `Bearer ${auth.token}` } : {};

  const [activeSection, setActiveSection] = useState('datos');

  const [profile, setProfile] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [profileForm, setProfileForm] = useState({ name: '', phone: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [newAddressForm, setNewAddressForm] = useState({ label: '', address: '', isDefault: false });
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [addressMessage, setAddressMessage] = useState('');
  const [addressError, setAddressError] = useState('');
  const [addressActionId, setAddressActionId] = useState('');

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [orders, setOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState('');

  const [favoritesError, setFavoritesError] = useState('');
  const [removingFavoriteId, setRemovingFavoriteId] = useState('');

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setIsLoadingProfile(true);
    setLoadError('');
    try {
      const data = await apiFetch(`/api/users/${userId}`, { headers: authHeader });
      setProfile(data);
      setProfileForm({ name: data.name || '', phone: data.phone || '' });
    } catch (err) {
      setLoadError(err.message || 'No fue posible cargar tu perfil.');
    } finally {
      setIsLoadingProfile(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadOrders = useCallback(async () => {
    if (!userId) return;
    setIsLoadingOrders(true);
    setOrdersError('');
    try {
      const data = await apiFetch('/api/orders/mine', { headers: authHeader });
      setOrders(data?.items || []);
    } catch (err) {
      setOrdersError(err.message || 'No fue posible cargar tus pedidos.');
    } finally {
      setIsLoadingOrders(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadProfile();
    loadOrders();
  }, [userId, loadProfile, loadOrders]);

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileError('');
    setProfileMessage('');
    try {
      const payload = {};
      if (profileForm.name !== (profile?.name || '')) payload.name = profileForm.name;
      if (profileForm.phone !== (profile?.phone || '')) payload.phone = profileForm.phone;

      if (Object.keys(payload).length === 0) {
        setProfileMessage('No hay cambios que guardar.');
        return;
      }

      const data = await apiFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // `favorites`/`addresses` NO vienen poblados/completos en esta
      // respuesta (PUT /:id no los toca) — se descartan para no pisar lo
      // que ya se cargó por separado con GET /:id.
      const { favorites, addresses, ...rest } = data.user || {};
      setProfile((prev) => ({ ...prev, ...rest }));
      auth.updateUser(rest);
      setProfileMessage('Datos actualizados.');
    } catch (err) {
      setProfileError(err.message || 'No fue posible guardar tus datos.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleNewAddressChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewAddressForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleAddAddress = async (e) => {
    e.preventDefault();
    setIsSavingAddress(true);
    setAddressError('');
    setAddressMessage('');
    try {
      const data = await apiFetch(`/api/users/${userId}/addresses`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(newAddressForm),
      });
      setProfile((prev) => ({ ...prev, addresses: data.user?.addresses || [] }));
      setNewAddressForm({ label: '', address: '', isDefault: false });
      setAddressMessage('Dirección agregada.');
    } catch (err) {
      setAddressError(err.message || 'No fue posible agregar la dirección.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleSetDefaultAddress = async (addressId) => {
    setAddressError('');
    setAddressActionId(addressId);
    try {
      const data = await apiFetch(`/api/users/${userId}/addresses/${addressId}`, {
        method: 'PUT',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      setProfile((prev) => ({ ...prev, addresses: data.user?.addresses || [] }));
    } catch (err) {
      setAddressError(err.message || 'No fue posible actualizar la dirección.');
    } finally {
      setAddressActionId('');
    }
  };

  const handleRemoveAddress = async (addressId) => {
    setAddressError('');
    setAddressActionId(addressId);
    try {
      const data = await apiFetch(`/api/users/${userId}/addresses/${addressId}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      setProfile((prev) => ({ ...prev, addresses: data.user?.addresses || [] }));
    } catch (err) {
      setAddressError(err.message || 'No fue posible eliminar la dirección.');
    } finally {
      setAddressActionId('');
    }
  };

  const handlePasswordFieldChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setIsSavingPassword(true);
    setPasswordError('');
    setPasswordMessage('');
    try {
      await apiFetch(`/api/users/${userId}/password`, {
        method: 'PATCH',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordForm),
      });
      setPasswordMessage('Contraseña actualizada.');
      setPasswordForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setPasswordError(err.message || 'No fue posible actualizar tu contraseña.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleRemoveFavorite = async (productId) => {
    setFavoritesError('');
    setRemovingFavoriteId(productId);
    try {
      const data = await apiFetch(`/api/users/${userId}/favorites/${productId}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      setProfile((prev) => ({ ...prev, favorites: data.user?.favorites || [] }));
    } catch (err) {
      setFavoritesError(err.message || 'No fue posible quitar el producto de favoritos.');
    } finally {
      setRemovingFavoriteId('');
    }
  };

  const handleLogout = () => {
    auth.logout();
    navigate('/');
  };

  const favorites = profile?.favorites || [];
  const pendingCount = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length;

  return (
    <section className="account-view">
      <span className="eyebrow">Mi cuenta</span>
      <h1 className="section-title">Hola, {profile?.name || auth.user?.name}</h1>

      {loadError ? <div className="auth-error">{loadError}</div> : null}

      <div className="account-layout">
        <aside className="account-sidebar">
          <nav>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`account-nav-item ${activeSection === s.id ? 'active' : ''}`}
                onClick={() => setActiveSection(s.id)}
              >
                <i className={`fas ${s.icon}`} aria-hidden="true" />
                <span>{s.label}</span>
                <i className="fas fa-chevron-right account-nav-arrow" aria-hidden="true" />
              </button>
            ))}
          </nav>
          <button type="button" className="account-nav-item account-nav-logout" onClick={handleLogout}>
            <i className="fas fa-power-off" aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        </aside>

        <div className="account-content">
          {activeSection === 'datos' && (
            <div className="account-panel">
              <h2>Mis datos</h2>
              <p className="account-readonly">Correo: {profile?.email || auth.user?.email} (no se puede modificar)</p>
              <form onSubmit={handleProfileSubmit} className="account-form">
                <label>
                  Nombre
                  <input
                    name="name"
                    value={profileForm.name}
                    onChange={handleProfileChange}
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </label>
                <label>
                  Teléfono (opcional)
                  <input
                    type="tel"
                    name="phone"
                    value={profileForm.phone}
                    onChange={handleProfileChange}
                    maxLength={40}
                    placeholder="55 1234 5678"
                  />
                </label>
                {profileError ? <div className="auth-error">{profileError}</div> : null}
                {profileMessage ? <div className="auth-success">{profileMessage}</div> : null}
                <button type="submit" className="btn btn-solid" disabled={isSavingProfile}>
                  {isSavingProfile ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </form>
            </div>
          )}

          {activeSection === 'password' && (
            <div className="account-panel">
              <h2>Contraseña</h2>
              <form onSubmit={handlePasswordSubmit} className="account-form">
                <label>
                  Contraseña actual
                  <input
                    type="password"
                    name="currentPassword"
                    value={passwordForm.currentPassword}
                    onChange={handlePasswordFieldChange}
                    required
                  />
                </label>
                <label>
                  Nueva contraseña
                  <input
                    type="password"
                    name="newPassword"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordFieldChange}
                    required
                    minLength={6}
                  />
                </label>
                {passwordError ? <div className="auth-error">{passwordError}</div> : null}
                {passwordMessage ? <div className="auth-success">{passwordMessage}</div> : null}
                <button type="submit" className="btn btn-solid" disabled={isSavingPassword}>
                  {isSavingPassword ? 'Guardando…' : 'Actualizar contraseña'}
                </button>
              </form>
            </div>
          )}

          {activeSection === 'direcciones' && (
            <div className="account-panel">
              <h2>Mis direcciones</h2>
              {addressError ? <div className="auth-error">{addressError}</div> : null}
              {addressMessage ? <div className="auth-success">{addressMessage}</div> : null}

              {isLoadingProfile ? <p>Cargando…</p> : null}
              {!isLoadingProfile && (profile?.addresses || []).length === 0 ? (
                <p className="account-empty">Todavía no guardas ninguna dirección.</p>
              ) : (
                <div className="account-addresses">
                  {(profile?.addresses || []).map((a) => (
                    <div className="account-address" key={a._id}>
                      <div className="account-address-body">
                        {a.isDefault ? (
                          <span className="account-address-default">
                            <i className="fas fa-star" aria-hidden="true" /> Dirección predeterminada
                          </span>
                        ) : null}
                        {a.label ? <strong>{a.label}</strong> : null}
                        <span>{a.address}</span>
                      </div>
                      <div className="account-address-actions">
                        {!a.isDefault && (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => handleSetDefaultAddress(a._id)}
                            disabled={addressActionId === a._id}
                          >
                            Usar como predeterminada
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handleRemoveAddress(a._id)}
                          disabled={addressActionId === a._id}
                        >
                          {addressActionId === a._id ? 'Eliminando…' : 'Eliminar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleAddAddress} className="account-form account-address-form">
                <label>
                  Etiqueta (opcional)
                  <input
                    name="label"
                    value={newAddressForm.label}
                    onChange={handleNewAddressChange}
                    maxLength={60}
                    placeholder="Casa, oficina…"
                  />
                </label>
                <label>
                  Dirección
                  <textarea
                    name="address"
                    value={newAddressForm.address}
                    onChange={handleNewAddressChange}
                    rows={2}
                    maxLength={500}
                    required
                    placeholder="Calle, número, colonia, ciudad, CP"
                  />
                </label>
                <label className="account-checkbox">
                  <input
                    type="checkbox"
                    name="isDefault"
                    checked={newAddressForm.isDefault}
                    onChange={handleNewAddressChange}
                  />
                  Usarla como predeterminada
                </label>
                <button type="submit" className="btn btn-solid" disabled={isSavingAddress}>
                  {isSavingAddress ? 'Agregando…' : 'Agregar dirección'}
                </button>
              </form>
            </div>
          )}

          {activeSection === 'pedidos' && (
            <div className="account-panel">
              <h2>Mis pedidos</h2>
              {isLoadingOrders ? <p>Cargando…</p> : null}
              {ordersError ? <div className="auth-error">{ordersError}</div> : null}
              {!isLoadingOrders && orders.length === 0 && !ordersError ? (
                <p className="account-empty">
                  Todavía no vemos pedidos con esta cuenta — solo se listan los que hiciste con sesión iniciada o
                  con este mismo correo.
                </p>
              ) : null}
              {pendingCount > 0 && (
                <p className="account-hint">
                  {pendingCount} {pendingCount === 1 ? 'pedido en curso' : 'pedidos en curso'}.
                </p>
              )}
              {orders.length > 0 && (
                <div className="account-orders">
                  {orders.map((o) => (
                    <div className="account-order" key={o._id}>
                      <div className="account-order-head">
                        <span>Folio TAC-{String(o.orderNumber ?? '').padStart(5, '0')}</span>
                        <span className={`account-order-status status-${o.status}`}>
                          {ORDER_STATUS_LABELS[o.status] || o.status}
                        </span>
                      </div>
                      <div className="account-order-meta">
                        <span>{formatDate(o.createdAt)}</span>
                        <span>{formatMxnLong(o.total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === 'favoritos' && (
            <div className="account-panel">
              <h2>Mi lista de deseos</h2>
              {favoritesError ? <div className="auth-error">{favoritesError}</div> : null}
              {isLoadingProfile ? <p>Cargando…</p> : null}
              {!isLoadingProfile && favorites.length === 0 ? (
                <p className="account-empty">Marca productos como favoritos desde su ficha para verlos aquí.</p>
              ) : (
                <div className="account-favorites">
                  {favorites.map((p) => (
                    <div className="account-fav-card" key={p._id}>
                      <Link to={`/tienda/${p._id}`} className="account-fav-fig">
                        {p.images?.[0] ? (
                          <img src={resolveStoreImageUrl(p.images[0])} alt={p.name} />
                        ) : (
                          <svg viewBox="0 0 100 100" aria-hidden="true">
                            <use href={`#${iconForCategory(p.category)}`} />
                          </svg>
                        )}
                      </Link>
                      <Link to={`/tienda/${p._id}`} className="account-fav-name">
                        {p.name}
                      </Link>
                      <span className="account-fav-price">{formatMxn(p.price)}</span>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => handleRemoveFavorite(p._id)}
                        disabled={removingFavoriteId === p._id}
                      >
                        {removingFavoriteId === p._id ? 'Quitando…' : 'Quitar'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default MiCuenta;
