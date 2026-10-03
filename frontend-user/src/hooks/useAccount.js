// src/hooks/useAccount.js
//
// Lógica de "Mi cuenta" (/mi-cuenta), sin UI: datos personales, contraseña,
// libreta de direcciones, pedidos (detalle, comprar de nuevo, ticket PDF y
// comprobante de pago), lista de deseos (cruzada con el catálogo), cerrar sesión y eliminar
// cuenta. La sección activa la maneja la página (?seccion=).
//
// Los datos completos se cargan con GET /api/users/:id porque auth.user (lo
// que regresó /login) no trae favoritos poblados ni necesariamente el
// teléfono/direcciones más recientes. La UI debe redirigir a /login si
// `isAuthenticated` es false.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiBaseUrl, reportSessionError } from '../utils/apiClient';
import { EMPTY_SAVED_ADDRESS, readFieldChange, savedAddressToForm } from '../utils/address';
import { useAuth } from './useAuth';
import { useCart } from './useCart';
import { useProducts } from './useProducts';

export const ACCOUNT_SECTIONS = [
  { id: 'resumen', label: 'Resumen', icon: 'fa-solid fa-house' },
  { id: 'pedidos', label: 'Mis pedidos', icon: 'fa-solid fa-box' },
  { id: 'direcciones', label: 'Mis direcciones', icon: 'fa-solid fa-location-dot' },
  { id: 'favoritos', label: 'Lista de deseos', icon: 'fa-regular fa-heart' },
  { id: 'datos', label: 'Mis datos', icon: 'fa-regular fa-user' },
  { id: 'seguridad', label: 'Seguridad', icon: 'fa-solid fa-lock' },
];

const MIN_PASSWORD = 6; // mismo mínimo que modules/auth.js

// Mismos estados que packages/core-api/modules/orders.js#ORDER_STATUSES.
export const ORDER_STATUS_LABELS = {
  pending: 'Pendiente de pago',
  payment_review: 'Comprobante en revisión',
  confirmed: 'Pago confirmado',
  processing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  ready_for_pickup: 'Listo para recoger',
  picked_up: 'Recogido',
  cancelled: 'Cancelado',
};

// Final del pedido según la entrega (el backend solo acepta los de cada una):
// envío a domicilio → Enviado, Entregado; recoger en tienda → Listo para
// recoger, Recogido.
const FINAL_STEPS = { shipping: ['shipped', 'delivered'], pickup: ['ready_for_pickup', 'picked_up'] };
const finalStepsOf = (order) => (order?.deliveryMethod === 'pickup' ? FINAL_STEPS.pickup : FINAL_STEPS.shipping);

// "cancelled" no forma parte de la secuencia — se muestra aparte.
export const ORDER_STATUS_SEQUENCE = ['pending', 'confirmed', 'processing', ...FINAL_STEPS.shipping];

// Pasos de la línea de tiempo de un pedido, con el final de su entrega.
// "Comprobante en revisión" solo aparece en los pedidos que lo usan (pagados
// por transferencia con comprobante), para no agregarle un paso vacío a los
// demás.
export const orderStatusSequence = (order) => [
  'pending',
  ...(order?.status === 'payment_review' || (order?.paymentProofs || []).length > 0 ? ['payment_review'] : []),
  'confirmed',
  'processing',
  ...finalStepsOf(order),
];

// El pedido sigue esperando que el cliente pague (y mande su comprobante).
export const isAwaitingPayment = (order) => ['pending', 'payment_review'].includes(order?.status);

// Pedidos para recoger anteriores a sus estados propios (si la tienda aún no
// corrió backend/scripts/migrate-pickup-statuses.mongo.js): "enviado" era
// "listo para recoger" y "entregado", "recogido".
const PICKUP_STATUS_LABELS = { shipped: 'Listo para recoger', delivered: 'Recogido' };

export const orderStatusLabel = (status, deliveryMethod) =>
  (deliveryMethod === 'pickup' && PICKUP_STATUS_LABELS[status]) || ORDER_STATUS_LABELS[status] || status;

export const isOrderActive = (order) => !['delivered', 'picked_up', 'cancelled'].includes(order?.status);

export const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const useAccount = () => {
  const auth = useAuth();
  const { addItem, openCart } = useCart();
  const { products: catalogProducts, isLoading: isLoadingCatalog } = useProducts();
  const userId = auth.user?._id;
  const token = auth.token;

  const authHeader = useCallback(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const jsonHeaders = () => ({ ...authHeader(), 'Content-Type': 'application/json' });

  // ---- Perfil ----
  const [profile, setProfile] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [profileForm, setProfileForm] = useState({ name: '', phone: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  // ---- Contraseña ----
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // ---- Direcciones ----
  const [newAddressForm, setNewAddressForm] = useState(EMPTY_SAVED_ADDRESS);
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [addressMessage, setAddressMessage] = useState('');
  const [addressError, setAddressError] = useState('');
  const [addressActionId, setAddressActionId] = useState('');
  // Edición en línea de una dirección guardada (puede coexistir con el
  // formulario de "agregar").
  const [editingAddressId, setEditingAddressId] = useState('');
  const [editAddressForm, setEditAddressForm] = useState(EMPTY_SAVED_ADDRESS);
  const [isSavingEditAddress, setIsSavingEditAddress] = useState(false);
  const [editAddressError, setEditAddressError] = useState('');

  // ---- Pedidos ----
  const [orders, setOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [reorderMessage, setReorderMessage] = useState('');
  const [reorderError, setReorderError] = useState('');
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  // ---- Favoritos ----
  const [favoritesError, setFavoritesError] = useState('');
  const [removingFavoriteId, setRemovingFavoriteId] = useState('');

  // ---- Eliminar cuenta ----
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setIsLoadingProfile(true);
    setLoadError('');
    try {
      const data = await apiFetch(`/api/users/${userId}`, { headers: authHeader() });
      setProfile(data);
      setProfileForm({ name: data.name || '', phone: data.phone || '' });
    } catch (err) {
      setLoadError(err.message || 'No fue posible cargar tu perfil.');
    } finally {
      setIsLoadingProfile(false);
    }
  }, [userId, authHeader]);

  const loadOrders = useCallback(async () => {
    if (!userId) return;
    setIsLoadingOrders(true);
    setOrdersError('');
    try {
      const data = await apiFetch('/api/orders/mine', { headers: authHeader() });
      setOrders(data?.items || []);
    } catch (err) {
      setOrdersError(err.message || 'No fue posible cargar tus pedidos.');
    } finally {
      setIsLoadingOrders(false);
    }
  }, [userId, authHeader]);

  useEffect(() => {
    if (!userId) return;
    loadProfile();
    loadOrders();
  }, [userId, loadProfile, loadOrders]);

  const setAddressesFromResponse = (data) =>
    setProfile((prev) => ({ ...prev, addresses: data.user?.addresses || [] }));

  // ---- Perfil: handlers ----
  const onProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileForm((prev) => ({ ...prev, [name]: value }));
  };

  const saveProfile = async (e) => {
    e?.preventDefault();
    setProfileError('');
    setProfileMessage('');
    const phoneDigits = profileForm.phone.replace(/\D/g, '');
    if (profileForm.phone.trim() && phoneDigits.length !== 10) {
      setProfileError('El teléfono debe tener 10 dígitos.');
      return;
    }
    setIsSavingProfile(true);
    try {
      const payload = {};
      if (profileForm.name !== (profile?.name || '')) payload.name = profileForm.name;
      if (phoneDigits !== (profile?.phone || '')) payload.phone = phoneDigits;
      if (Object.keys(payload).length === 0) {
        setProfileMessage('No hay cambios que guardar.');
        return;
      }
      const data = await apiFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify(payload),
      });
      // PUT /:id no trae favorites/addresses completos — se descartan para no
      // pisar lo cargado con GET /:id.
      // eslint-disable-next-line no-unused-vars
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

  // ---- Contraseña: handlers ----
  const onPasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const savePassword = async (e) => {
    e?.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    if (passwordForm.newPassword.length < MIN_PASSWORD) {
      setPasswordError(`La contraseña nueva debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Las contraseñas nuevas no coinciden.');
      return;
    }
    setIsSavingPassword(true);
    try {
      await apiFetch(`/api/users/${userId}/password`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }),
      });
      setPasswordMessage('Contraseña actualizada.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordError(err.message || 'No fue posible actualizar tu contraseña.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  // ---- Direcciones: handlers ----
  const onNewAddressChange = (e) => {
    const [name, value] = readFieldChange(e);
    setNewAddressForm((prev) => ({ ...prev, [name]: value }));
  };

  const addAddress = async (e) => {
    e?.preventDefault();
    setIsSavingAddress(true);
    setAddressError('');
    setAddressMessage('');
    try {
      const data = await apiFetch(`/api/users/${userId}/addresses`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(newAddressForm),
      });
      setAddressesFromResponse(data);
      setNewAddressForm(EMPTY_SAVED_ADDRESS);
      setShowAddAddressForm(false);
      setAddressMessage('Dirección agregada.');
    } catch (err) {
      setAddressError(err.message || 'No fue posible agregar la dirección.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const setDefaultAddress = async (addressId) => {
    setAddressError('');
    setAddressActionId(addressId);
    try {
      const data = await apiFetch(`/api/users/${userId}/addresses/${addressId}`, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify({ isDefault: true }),
      });
      setAddressesFromResponse(data);
    } catch (err) {
      setAddressError(err.message || 'No fue posible actualizar la dirección.');
    } finally {
      setAddressActionId('');
    }
  };

  const removeAddress = async (addressId) => {
    setAddressError('');
    setAddressActionId(addressId);
    try {
      const data = await apiFetch(`/api/users/${userId}/addresses/${addressId}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      setAddressesFromResponse(data);
      if (editingAddressId === addressId) setEditingAddressId('');
    } catch (err) {
      setAddressError(err.message || 'No fue posible eliminar la dirección.');
    } finally {
      setAddressActionId('');
    }
  };

  const startEditAddress = (address) => {
    setEditAddressError('');
    setEditingAddressId(address._id);
    setEditAddressForm(savedAddressToForm(address));
  };

  const cancelEditAddress = () => {
    setEditingAddressId('');
    setEditAddressError('');
  };

  const onEditAddressChange = (e) => {
    const [name, value] = readFieldChange(e);
    setEditAddressForm((prev) => ({ ...prev, [name]: value }));
  };

  const saveEditAddress = async (e) => {
    e?.preventDefault();
    setIsSavingEditAddress(true);
    setEditAddressError('');
    try {
      const data = await apiFetch(`/api/users/${userId}/addresses/${editingAddressId}`, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify(editAddressForm),
      });
      setAddressesFromResponse(data);
      setEditingAddressId('');
    } catch (err) {
      setEditAddressError(err.message || 'No fue posible guardar los cambios.');
    } finally {
      setIsSavingEditAddress(false);
    }
  };

  // ---- Pedidos: handlers ----
  const openOrder = (orderId) => {
    setReorderMessage('');
    setReorderError('');
    setDownloadError('');
    setSelectedOrderId(orderId);
  };

  const closeOrder = () => setSelectedOrderId('');

  // "Comprar de nuevo": compara contra el catálogo público (solo trae
  // productos con stock). Lo que ya no aparece se reporta como no disponible;
  // lo demás se agrega igual (parcial, no todo o nada).
  const reorder = (order) => {
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
      setReorderMessage(
        addedCount === 1 ? 'Se agregó 1 producto a tu canasta.' : `Se agregaron ${addedCount} productos a tu canasta.`
      );
    }
  };

  // Ticket del pedido. El PDF exige Bearer token, así que no puede ser un
  // <a href>: se trae como blob y se abre en una pestaña nueva.
  const downloadReceipt = async (order) => {
    setDownloadError('');
    setIsDownloadingReceipt(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/orders/${order._id}/pdf`, { headers: authHeader() });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        reportSessionError(response.status, payload?.error?.code, authHeader());
        throw new Error(payload?.error?.message || 'No fue posible descargar tu ticket.');
      }
      const blob = await response.blob();
      window.open(window.URL.createObjectURL(blob), '_blank');
    } catch (err) {
      setDownloadError(err.message || 'No fue posible descargar tu ticket.');
    } finally {
      setIsDownloadingReceipt(false);
    }
  };

  // ---- Favoritos ----
  // Cada favorito (populado con name/price/images) se cruza con el catálogo
  // público, que trae imagen resuelta, precio vigente y solo lo que tiene
  // existencias: `product` null = ya no está disponible.
  const favoriteItems = useMemo(() => {
    const catalogById = new Map(catalogProducts.map((p) => [String(p.id), p]));
    return (profile?.favorites || []).map((fav) => {
      const id = String(typeof fav === 'string' ? fav : fav._id);
      const product = catalogById.get(id) || null;
      return { id, name: product?.name || fav?.name || 'Producto', product };
    });
  }, [profile?.favorites, catalogProducts]);

  // Agregar un favorito a la canasta (los que tienen opciones se eligen en su
  // ficha, igual que en la tienda).
  const addFavoriteToCart = (product) => {
    addItem(product, 1, {});
    openCart();
  };

  // ---- Favoritos: handlers ----
  const removeFavorite = async (productId) => {
    setFavoritesError('');
    setRemovingFavoriteId(productId);
    try {
      const data = await apiFetch(`/api/users/${userId}/favorites/${productId}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      const favorites = data.user?.favorites || [];
      setProfile((prev) => ({ ...prev, favorites }));
      auth.updateUser({ favorites: favorites.map((f) => (typeof f === 'string' ? f : f._id)) });
    } catch (err) {
      setFavoritesError(err.message || 'No fue posible quitar el producto de favoritos.');
    } finally {
      setRemovingFavoriteId('');
    }
  };

  // ---- Sesión / cuenta ----
  const logout = () => auth.logout();

  // Derecho ARCO de Cancelación: el backend no borra físicamente la cuenta,
  // la anonimiza (DELETE /api/users/:id). Devuelve true si se eliminó; la UI
  // cierra entonces la sesión (logout) y sale de /mi-cuenta.
  const deleteAccount = async () => {
    setDeleteAccountError('');
    setIsDeletingAccount(true);
    try {
      await apiFetch(`/api/users/${userId}`, { method: 'DELETE', headers: authHeader() });
      return true;
    } catch (err) {
      setDeleteAccountError(err.message || 'No fue posible eliminar tu cuenta.');
      setIsDeletingAccount(false);
      return false;
    }
  };

  return {
    isAuthenticated: auth.isAuthenticated,
    user: auth.user,

    profile: {
      data: profile,
      isLoading: isLoadingProfile,
      loadError,
      form: profileForm,
      onChange: onProfileChange,
      onSubmit: saveProfile,
      isSaving: isSavingProfile,
      message: profileMessage,
      error: profileError,
    },

    password: {
      form: passwordForm,
      onChange: onPasswordChange,
      onSubmit: savePassword,
      isSaving: isSavingPassword,
      message: passwordMessage,
      error: passwordError,
    },

    addresses: {
      list: profile?.addresses || [],
      message: addressMessage,
      error: addressError,
      actionId: addressActionId,
      setDefault: setDefaultAddress,
      remove: removeAddress,
      // Agregar
      showAddForm: showAddAddressForm,
      setShowAddForm: setShowAddAddressForm,
      newForm: newAddressForm,
      onNewChange: onNewAddressChange,
      add: addAddress,
      isAdding: isSavingAddress,
      // Editar
      editingId: editingAddressId,
      editForm: editAddressForm,
      startEdit: startEditAddress,
      cancelEdit: cancelEditAddress,
      onEditChange: onEditAddressChange,
      saveEdit: saveEditAddress,
      isSavingEdit: isSavingEditAddress,
      editError: editAddressError,
    },

    orders: {
      list: orders,
      isLoading: isLoadingOrders,
      error: ordersError,
      pendingCount: orders.filter(isOrderActive).length,
      selected: orders.find((o) => o._id === selectedOrderId) || null,
      open: openOrder,
      close: closeOrder,
      reorder,
      reorderMessage,
      reorderError,
      reload: loadOrders,
      authHeader,
      downloadReceipt,
      isDownloadingReceipt,
      downloadError,
    },

    favorites: {
      list: favoriteItems,
      isLoadingCatalog,
      addToCart: addFavoriteToCart,
      remove: removeFavorite,
      removingId: removingFavoriteId,
      error: favoritesError,
    },

    deleteAccount: {
      showConfirm: showDeleteAccountConfirm,
      setShowConfirm: setShowDeleteAccountConfirm,
      confirm: deleteAccount,
      isDeleting: isDeletingAccount,
      error: deleteAccountError,
    },

    logout,
  };
};
