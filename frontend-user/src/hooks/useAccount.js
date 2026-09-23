// src/hooks/useAccount.js
//
// Lógica de "Mi cuenta" (/mi-cuenta), sin UI: datos personales, contraseña,
// libreta de direcciones, pedidos (detalle, comprar de nuevo, comprobante
// PDF), favoritos, cerrar sesión y eliminar cuenta.
//
// Los datos completos se cargan con GET /api/users/:id porque auth.user (lo
// que regresó /login) no trae favoritos poblados ni necesariamente el
// teléfono/direcciones más recientes. La UI debe redirigir a /login si
// `isAuthenticated` es false.
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getApiBaseUrl } from '../utils/apiClient';
import { EMPTY_SAVED_ADDRESS, readFieldChange, savedAddressToForm } from '../utils/address';
import { useAuth } from './useAuth';
import { useCart } from './useCart';
import { useProducts } from './useProducts';

export const ACCOUNT_SECTIONS = [
  { id: 'datos', label: 'Mis datos' },
  { id: 'password', label: 'Contraseña' },
  { id: 'direcciones', label: 'Mis direcciones' },
  { id: 'pedidos', label: 'Mis pedidos' },
  { id: 'favoritos', label: 'Mi lista de deseos' },
];

export const ORDER_STATUS_LABELS = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  processing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

// "cancelled" no forma parte de la secuencia — se muestra aparte.
export const ORDER_STATUS_SEQUENCE = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

export const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const useAccount = () => {
  const auth = useAuth();
  const { addItem } = useCart();
  const { products: catalogProducts } = useProducts();
  const userId = auth.user?._id;
  const token = auth.token;

  const authHeader = useCallback(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const jsonHeaders = () => ({ ...authHeader(), 'Content-Type': 'application/json' });

  const [activeSection, setActiveSection] = useState('datos');

  // ---- Perfil ----
  const [profile, setProfile] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [profileForm, setProfileForm] = useState({ name: '', phone: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  // ---- Contraseña ----
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
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
    setIsSavingPassword(true);
    setPasswordError('');
    setPasswordMessage('');
    try {
      await apiFetch(`/api/users/${userId}/password`, {
        method: 'PATCH',
        headers: jsonHeaders(),
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
      setReorderMessage(`Se agregaron ${addedCount} producto${addedCount === 1 ? '' : 's'} a tu canasta.`);
    }
  };

  // El PDF exige Bearer token, así que no puede ser un <a href>: se trae
  // como blob y se abre en una pestaña nueva.
  const downloadReceipt = async (order) => {
    setDownloadError('');
    setIsDownloadingReceipt(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/orders/${order._id}/pdf`, { headers: authHeader() });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || 'No fue posible descargar el comprobante.');
      }
      const blob = await response.blob();
      window.open(window.URL.createObjectURL(blob), '_blank');
    } catch (err) {
      setDownloadError(err.message || 'No fue posible descargar el comprobante.');
    } finally {
      setIsDownloadingReceipt(false);
    }
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
  // la anonimiza (DELETE /api/users/:id). Devuelve true si se eliminó, para
  // que la UI navegue fuera.
  const deleteAccount = async () => {
    setDeleteAccountError('');
    setIsDeletingAccount(true);
    try {
      await apiFetch(`/api/users/${userId}`, { method: 'DELETE', headers: authHeader() });
      auth.logout();
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
    activeSection,
    setActiveSection,

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
      pendingCount: orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length,
      selected: orders.find((o) => o._id === selectedOrderId) || null,
      open: openOrder,
      close: closeOrder,
      reorder,
      reorderMessage,
      reorderError,
      downloadReceipt,
      isDownloadingReceipt,
      downloadError,
    },

    favorites: {
      list: profile?.favorites || [],
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
