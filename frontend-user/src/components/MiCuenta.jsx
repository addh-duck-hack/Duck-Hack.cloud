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
import { apiFetch, getApiBaseUrl } from '../utils/apiClient';
import { useCart, formatMxn, formatMxnLong } from '../hooks/useCart';
import { useProducts } from '../hooks/useProducts';
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

// "cancelled" no forma parte de la secuencia — se muestra aparte (ver el
// detalle de pedido más abajo), no encaja en un timeline lineal.
const ORDER_STATUS_SEQUENCE = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

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

// Mismos campos que Order.shippingAddress (packages/core-api/modules/orders.js)
// — así una dirección guardada se copia tal cual al hacer un pedido (ver
// Cart.jsx#pickShippingAddress en frontend-user). `label`/`isDefault` son
// propios de la libreta, no existen en el pedido.
const INITIAL_ADDRESS_FORM = {
  label: '',
  recipientName: '',
  phone: '',
  street: '',
  exteriorNumber: '',
  interiorNumber: '',
  zipCode: '',
  neighborhood: '',
  city: '',
  state: '',
  isDefault: false,
};

// Campos de una dirección — se usa tal cual tanto para agregar una nueva
// como para editar una ya guardada (ver handleAddAddress/handleSaveEditAddress
// más abajo), para no duplicar el mismo bloque de 9 campos dos veces.
const AddressFormFields = ({ values, onChange }) => (
  <>
    <label>
      Etiqueta (opcional)
      <input name="label" value={values.label} onChange={onChange} maxLength={60} placeholder="Casa, oficina…" />
    </label>

    <div className="account-address-grid">
      <label>
        Nombre de quien recibe
        <input
          name="recipientName"
          value={values.recipientName}
          onChange={onChange}
          maxLength={200}
          required
          placeholder="María Fernanda Ruiz"
        />
      </label>
      <label>
        Teléfono
        <input name="phone" value={values.phone} onChange={onChange} maxLength={40} required placeholder="55 1234 5678" />
      </label>
      <label className="account-field-wide">
        Calle
        <input name="street" value={values.street} onChange={onChange} maxLength={200} required placeholder="Av. Reforma" />
      </label>
      <label>
        Número exterior
        <input
          name="exteriorNumber"
          value={values.exteriorNumber}
          onChange={onChange}
          maxLength={20}
          required
          placeholder="123"
        />
      </label>
      <label>
        Número interior (opcional)
        <input
          name="interiorNumber"
          value={values.interiorNumber}
          onChange={onChange}
          maxLength={20}
          placeholder="Depto. 4"
        />
      </label>
      <label>
        Código postal
        <input name="zipCode" value={values.zipCode} onChange={onChange} maxLength={10} required placeholder="73080" />
      </label>
      <label>
        Colonia
        <input
          name="neighborhood"
          value={values.neighborhood}
          onChange={onChange}
          maxLength={120}
          required
          placeholder="Centro"
        />
      </label>
      <label>
        Ciudad
        <input
          name="city"
          value={values.city}
          onChange={onChange}
          maxLength={120}
          required
          placeholder="Xicotepec de Juárez"
        />
      </label>
      <label>
        Estado
        <input name="state" value={values.state} onChange={onChange} maxLength={120} required placeholder="Puebla" />
      </label>
    </div>

    <label className="account-checkbox">
      <input type="checkbox" name="isDefault" checked={values.isDefault} onChange={onChange} />
      Usarla como predeterminada
    </label>
  </>
);

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

  const [newAddressForm, setNewAddressForm] = useState(INITIAL_ADDRESS_FORM);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [addressMessage, setAddressMessage] = useState('');
  const [addressError, setAddressError] = useState('');
  const [addressActionId, setAddressActionId] = useState('');

  // Edición en línea de una dirección ya guardada — separado de
  // newAddressForm (que es solo para agregar una nueva) porque ambos
  // formularios pueden coexistir en pantalla (agregar mientras se edita otra).
  const [editingAddressId, setEditingAddressId] = useState('');
  const [editAddressForm, setEditAddressForm] = useState(INITIAL_ADDRESS_FORM);
  const [isSavingEditAddress, setIsSavingEditAddress] = useState(false);
  const [editAddressError, setEditAddressError] = useState('');

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [orders, setOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState('');

  // Detalle de un pedido — se abre en el mismo panel "pedidos" (sin ruta
  // aparte, ver JSX más abajo). El pedido completo ya viene en `orders`
  // (GET /api/orders/mine trae items/shippingAddress/etc. completos), así
  // que aquí solo guardamos CUÁL está abierto.
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [reorderMessage, setReorderMessage] = useState('');
  const [reorderError, setReorderError] = useState('');
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const { addItem } = useCart();
  const { products: catalogProducts } = useProducts();

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
      setNewAddressForm(INITIAL_ADDRESS_FORM);
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
      if (editingAddressId === addressId) setEditingAddressId('');
    } catch (err) {
      setAddressError(err.message || 'No fue posible eliminar la dirección.');
    } finally {
      setAddressActionId('');
    }
  };

  const handleStartEditAddress = (a) => {
    setEditAddressError('');
    setEditingAddressId(a._id);
    setEditAddressForm({
      label: a.label || '',
      recipientName: a.recipientName || '',
      phone: a.phone || '',
      street: a.street || '',
      exteriorNumber: a.exteriorNumber || '',
      interiorNumber: a.interiorNumber || '',
      zipCode: a.zipCode || '',
      neighborhood: a.neighborhood || '',
      city: a.city || '',
      state: a.state || '',
      isDefault: Boolean(a.isDefault),
    });
  };

  const handleCancelEditAddress = () => {
    setEditingAddressId('');
    setEditAddressError('');
  };

  const handleEditAddressFieldChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditAddressForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSaveEditAddress = async (e) => {
    e.preventDefault();
    setIsSavingEditAddress(true);
    setEditAddressError('');
    try {
      const data = await apiFetch(`/api/users/${userId}/addresses/${editingAddressId}`, {
        method: 'PUT',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(editAddressForm),
      });
      setProfile((prev) => ({ ...prev, addresses: data.user?.addresses || [] }));
      setEditingAddressId('');
    } catch (err) {
      setEditAddressError(err.message || 'No fue posible guardar los cambios.');
    } finally {
      setIsSavingEditAddress(false);
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

  const handleOpenOrder = (orderId) => {
    setReorderMessage('');
    setReorderError('');
    setDownloadError('');
    setSelectedOrderId(orderId);
  };

  const handleBackToOrders = () => {
    setSelectedOrderId('');
  };

  // "Comprar de nuevo": compara contra el catálogo público YA cargado por
  // useProducts() (que solo trae productos con stock, ver
  // packages/core-api/modules/products.js) — un producto que ya no aparece
  // ahí (se borró, se desactivó o se agotó) se reporta como no disponible en
  // vez de agregarse. Se agregan los demás igual (parcial), no todo o nada.
  const handleReorder = (order) => {
    setReorderError('');
    setReorderMessage('');

    const catalogById = new Map(catalogProducts.map((p) => [String(p.id), p]));
    const unavailable = [];
    let addedCount = 0;

    for (const item of order.items || []) {
      const product = catalogById.get(String(item.product));
      if (!product) {
        unavailable.push(item.productName);
        continue;
      }
      addItem(product, item.quantity, {});
      addedCount += 1;
    }

    if (unavailable.length > 0) {
      setReorderError(
        `Producto no disponible: ${unavailable.join(', ')}${unavailable.length === 1 ? ' ya no está' : ' ya no están'} en la tienda.`
      );
    }
    if (addedCount > 0) {
      setReorderMessage(`Se agregaron ${addedCount} producto${addedCount === 1 ? '' : 's'} a tu canasta.`);
    }
  };

  // El PDF exige Bearer token, así que no puede ser un <a href> normal —
  // mismo patrón que frontend-admin/src/components/InvoiceList.jsx#handleViewPdf:
  // se trae como blob y se abre en una pestaña nueva con el visor nativo.
  const handleDownloadReceipt = async (order) => {
    setDownloadError('');
    setIsDownloadingReceipt(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/orders/${order._id}/pdf`, { headers: authHeader });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || 'No fue posible descargar el comprobante.');
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (err) {
      setDownloadError(err.message || 'No fue posible descargar el comprobante.');
    } finally {
      setIsDownloadingReceipt(false);
    }
  };

  const favorites = profile?.favorites || [];
  const pendingCount = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length;
  const selectedOrder = orders.find((o) => o._id === selectedOrderId) || null;

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
                  {(profile?.addresses || []).map((a) =>
                    editingAddressId === a._id ? (
                      <form
                        onSubmit={handleSaveEditAddress}
                        className="account-form account-address-form account-address-edit"
                        key={a._id}
                      >
                        <AddressFormFields values={editAddressForm} onChange={handleEditAddressFieldChange} />
                        {editAddressError ? <div className="auth-error">{editAddressError}</div> : null}
                        <div className="account-address-actions">
                          <button type="submit" className="btn btn-solid" disabled={isSavingEditAddress}>
                            {isSavingEditAddress ? 'Guardando…' : 'Guardar cambios'}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={handleCancelEditAddress}
                            disabled={isSavingEditAddress}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="account-address" key={a._id}>
                        <div className="account-address-body">
                          {a.isDefault ? (
                            <span className="account-address-default">
                              <i className="fas fa-star" aria-hidden="true" /> Dirección predeterminada
                            </span>
                          ) : null}
                          {a.label ? <strong>{a.label}</strong> : null}
                          <span>
                            {a.recipientName} · {a.phone}
                          </span>
                          <span>
                            {a.street} {a.exteriorNumber}
                            {a.interiorNumber ? `, Int. ${a.interiorNumber}` : ''}
                          </span>
                          <span>
                            {a.neighborhood}, {a.city}, {a.state}
                          </span>
                          <span>C.P. {a.zipCode}</span>
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
                            onClick={() => handleStartEditAddress(a)}
                            disabled={addressActionId === a._id}
                          >
                            Editar
                          </button>
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
                    )
                  )}
                </div>
              )}

              <form onSubmit={handleAddAddress} className="account-form account-address-form">
                <AddressFormFields values={newAddressForm} onChange={handleNewAddressChange} />
                <button type="submit" className="btn btn-solid" disabled={isSavingAddress}>
                  {isSavingAddress ? 'Agregando…' : 'Agregar dirección'}
                </button>
              </form>
            </div>
          )}

          {activeSection === 'pedidos' && (
            <div className="account-panel">
              {selectedOrder ? (
                <>
                  <button type="button" className="btn account-back-btn" onClick={handleBackToOrders}>
                    ← Volver a mis pedidos
                  </button>
                  <h2>Pedido TAC-{String(selectedOrder.orderNumber ?? '').padStart(5, '0')}</h2>
                  <p className="account-hint">
                    {formatDate(selectedOrder.createdAt)} · {formatMxnLong(selectedOrder.total)}
                  </p>

                  {selectedOrder.status === 'cancelled' ? (
                    <p className="account-order-cancelled">
                      <i className="fas fa-ban" aria-hidden="true" /> Este pedido fue cancelado.
                    </p>
                  ) : (
                    <div className="account-timeline">
                      {ORDER_STATUS_SEQUENCE.map((s, i) => {
                        const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(selectedOrder.status);
                        const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
                        return (
                          <div className={`account-timeline-step ${state}`} key={s}>
                            <span className="account-timeline-dot" />
                            <span className="account-timeline-label">{ORDER_STATUS_LABELS[s]}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <h3 className="account-subheading">Productos</h3>
                  <div className="account-order-items">
                    {(selectedOrder.items || []).map((item, index) => (
                      <div className="account-order-item" key={`${item.product}-${index}`}>
                        <span>
                          {item.productName} ×{item.quantity}
                        </span>
                        <span>{formatMxn(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>

                  {reorderError ? <div className="auth-error">{reorderError}</div> : null}
                  {reorderMessage ? (
                    <div className="auth-success">
                      {reorderMessage} <Link to="/carrito">Ver canasta →</Link>
                    </div>
                  ) : null}
                  {downloadError ? <div className="auth-error">{downloadError}</div> : null}

                  <div className="account-order-actions">
                    <button type="button" className="btn btn-solid" onClick={() => handleReorder(selectedOrder)}>
                      Comprar de nuevo
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleDownloadReceipt(selectedOrder)}
                      disabled={isDownloadingReceipt}
                    >
                      {isDownloadingReceipt ? 'Generando…' : 'Descargar comprobante'}
                    </button>
                  </div>
                </>
              ) : (
                <>
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
                        <button
                          type="button"
                          className="account-order account-order-clickable"
                          key={o._id}
                          onClick={() => handleOpenOrder(o._id)}
                        >
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
                        </button>
                      ))}
                    </div>
                  )}
                </>
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
