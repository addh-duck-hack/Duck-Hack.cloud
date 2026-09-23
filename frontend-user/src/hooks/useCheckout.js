// src/hooks/useCheckout.js
//
// Flujo de checkout de /carrito, sin UI. Pasos:
//   0 canasta -> 1 tu cuenta (login/registro/invitado) -> 2 datos de envío
//   -> 3 confirmación.
// Con sesión iniciada el paso 1 se salta.
//
// El pedido va siempre por POST /api/orders/public (useCart#submitOrder), sin
// pasarela de pago: entra "pendiente" y la tienda confirma pago/entrega a mano.
// El folio de la confirmación es el orderNumber real que regresa la API.
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { EMPTY_SHIPPING_ADDRESS, pickShippingAddress } from '../utils/address';
import { useAuth } from './useAuth';
import { useCart } from './useCart';
import { useLoginForm, useRegisterForm } from './useAuthForms';

export const CHECKOUT_STEPS = ['Tu canasta', 'Tu cuenta', 'Datos de envío', '¡Gracias!'];

export const PAYMENT_METHODS = [
  {
    id: 'transfer',
    label: 'Transferencia / SPEI',
    hint: 'Te enviamos los datos y confirmamos al recibir el pago.',
    confirmation: 'Te contactamos con los datos para la transferencia; tu pedido queda apartado como pendiente de pago.',
    requiresAddress: true,
  },
  {
    id: 'pickup',
    label: 'Pago en finca',
    hint: 'Recoge y paga en Xicotepec.',
    confirmation: 'Puedes pasar a recoger y pagar en la finca; te escribimos para coordinar.',
    requiresAddress: false,
  },
];

const INITIAL_FORM = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  shippingAddress: EMPTY_SHIPPING_ADDRESS,
};

const scrollTop = () => window.scrollTo(0, 0);

export const formatOrderFolio = (orderNumber) => `TAC-${String(orderNumber ?? '').padStart(5, '0')}`;

export const useCheckout = () => {
  const cart = useCart();
  const auth = useAuth();

  const [step, setStepState] = useState(0);
  const [form, setForm] = useState(INITIAL_FORM);
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [order, setOrder] = useState(null);

  // Libreta de direcciones del cliente (solo con sesión). selectedAddressId
  // vacío = ninguna elegida todavía; showNewAddressForm alterna entre el
  // listado y el formulario de dirección nueva.
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [isSavingNewAddress, setIsSavingNewAddress] = useState(false);
  const [newAddressError, setNewAddressError] = useState('');
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);

  const setStep = (next) => {
    setStepState(next);
    scrollTop();
  };

  const paymentInfo = PAYMENT_METHODS.find((m) => m.id === paymentMethod) || PAYMENT_METHODS[0];
  const addressRequired = paymentInfo.requiresAddress;

  const onFieldChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onAddressFieldChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, shippingAddress: { ...prev.shippingAddress, [name]: value } }));
  };

  const applyAddress = (address) => {
    setSelectedAddressId(address?._id || '');
    const picked = pickShippingAddress(address);
    if (picked) setForm((prev) => ({ ...prev, shippingAddress: picked }));
  };

  // Con predeterminada -> se preselecciona. Con direcciones pero sin
  // predeterminada -> ninguna marcada (la UI debe obligar a elegir una). Sin
  // direcciones -> la UI muestra "Agregar dirección" en vez del formulario.
  const syncAddressesFromUser = (user) => {
    const list = user?.addresses || [];
    setAddresses(list);
    setShowNewAddressForm(false);
    const defaultAddress = list.find((a) => a.isDefault);
    if (defaultAddress) applyAddress(defaultAddress);
    else setSelectedAddressId('');
  };

  const resetAddressBook = () => {
    setAddresses([]);
    setSelectedAddressId('');
    setShowNewAddressForm(false);
  };

  const prefillCustomer = ({ customerName, customerEmail, customerPhone }) => {
    setForm((prev) => ({
      ...prev,
      customerName: customerName || prev.customerName,
      customerEmail: customerEmail || prev.customerEmail,
      customerPhone: customerPhone || prev.customerPhone,
    }));
  };

  // Paso 0 -> siguiente. Con sesión se salta "Tu cuenta" y se trae la libreta
  // fresca del servidor (auth.user.addresses es la foto del momento del login
  // y puede estar vieja).
  const goToAccountOrSkip = async () => {
    if (!auth.isAuthenticated) {
      setStep(1);
      return;
    }
    prefillCustomer({
      customerName: auth.user.name,
      customerEmail: auth.user.email,
      customerPhone: auth.user.phone,
    });
    setIsLoadingAddresses(true);
    try {
      const freshUser = await apiFetch(`/api/users/${auth.user._id}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      syncAddressesFromUser(freshUser);
    } catch {
      // Best-effort: mejor lo que ya teníamos que bloquear el checkout.
      syncAddressesFromUser(auth.user);
    } finally {
      setIsLoadingAddresses(false);
    }
    setStep(2);
  };

  // Paso 1 resuelto (login, registro o invitado). `user` solo viene tras un
  // login; tras un registro no hay sesión (falta verificar el correo) y se
  // sigue como invitado con los datos ya escritos.
  const continueFromAccount = ({ customerName, customerEmail, customerPhone, user } = {}) => {
    prefillCustomer({ customerName, customerEmail, customerPhone });
    if (user) syncAddressesFromUser(user);
    else resetAddressBook();
    setStep(2);
  };

  const continueAsGuest = () => continueFromAccount();

  // "¿No eres tú?" en el paso 2.
  const forgetAccount = () => {
    auth.logout();
    resetAddressBook();
    setStep(1);
  };

  const selectSavedAddress = (address) => applyAddress(address);

  const openNewAddressForm = () => setShowNewAddressForm(true);

  const cancelNewAddressForm = () => {
    setShowNewAddressForm(false);
    setNewAddressError('');
  };

  // Con sesión, la dirección nueva se guarda en la libreta (no solo en el
  // pedido) para que aparezca la próxima vez.
  const saveNewAddress = async () => {
    setNewAddressError('');
    setIsSavingNewAddress(true);
    try {
      const data = await apiFetch(`/api/users/${auth.user._id}/addresses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form.shippingAddress),
      });
      const updated = data.user?.addresses || [];
      setAddresses(updated);
      // El backend hace push al final: la recién creada es la última.
      const created = updated[updated.length - 1];
      if (created) applyAddress(created);
      setShowNewAddressForm(false);
    } catch (err) {
      setNewAddressError(err.message || 'No fue posible guardar la dirección.');
    } finally {
      setIsSavingNewAddress(false);
    }
  };

  // Paso 2 -> envía el pedido. La canasta se vacía en cuanto el pedido se
  // crea; la confirmación usa order.items, no el estado de la canasta.
  const submitOrder = async (e) => {
    e?.preventDefault();
    setSubmitError('');
    setIsSubmitting(true);
    try {
      const created = await cart.submitOrder({
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        shippingAddress: form.shippingAddress,
        paymentMethod,
      });
      setOrder(created);
      cart.clear();
      setStep(3);
    } catch (err) {
      setSubmitError(err.message || 'No fue posible enviar tu pedido. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reinicia todo el flujo (botón "Seguir comprando" de la confirmación).
  const reset = () => {
    cart.clear();
    setForm(INITIAL_FORM);
    setPaymentMethod('transfer');
    setOrder(null);
    resetAddressBook();
    setStepState(0);
  };

  const orderItemCount = order?.items?.length
    ? order.items.reduce((sum, i) => sum + i.quantity, 0)
    : cart.count;
  const orderConfirmation =
    PAYMENT_METHODS.find((m) => m.id === order?.paymentMethod)?.confirmation || paymentInfo.confirmation;

  return {
    cart,
    auth,
    step,
    stepLabel: CHECKOUT_STEPS[step],
    setStep,
    isCartEmpty: cart.lines.length === 0 && step < 3,

    // Paso 0
    goToAccountOrSkip,
    isLoadingAddresses,

    // Paso 1
    continueFromAccount,
    continueAsGuest,

    // Paso 2
    form,
    onFieldChange,
    onAddressFieldChange,
    paymentMethod,
    setPaymentMethod,
    addressRequired,
    forgetAccount,
    addresses,
    selectedAddressId,
    selectSavedAddress,
    showNewAddressForm,
    openNewAddressForm,
    cancelNewAddressForm,
    saveNewAddress,
    isSavingNewAddress,
    newAddressError,
    submitOrder,
    isSubmitting,
    submitError,

    // Paso 3
    order,
    orderFolio: order ? formatOrderFolio(order.orderNumber) : '',
    orderItemCount,
    orderConfirmation,
    reset,
  };
};

const REGISTER_AUTO_CONTINUE_MS = 1600;

// Paso "Tu cuenta" del checkout: elegir entre iniciar sesión, crear cuenta o
// seguir como invitado. `onContinue` es useCheckout().continueFromAccount.
// Tras registrarse se continúa solo (como invitado, con los mismos datos)
// después de un momento, o de inmediato con continueAfterRegister().
export const useCheckoutAccount = ({ onContinue }) => {
  const [mode, setModeState] = useState('choice'); // 'choice' | 'login' | 'register'
  const autoContinueRef = useRef(null);

  useEffect(() => () => clearTimeout(autoContinueRef.current), []);

  const login = useLoginForm({
    onSuccess: (data, form) =>
      onContinue({
        customerName: data?.user?.name || '',
        customerEmail: data?.user?.email || form.email,
        customerPhone: data?.user?.phone || '',
        user: data?.user || { email: form.email },
      }),
  });

  const continueWithRegisterData = (form) =>
    onContinue({ customerName: form.name, customerEmail: form.email, customerPhone: form.phone });

  const register = useRegisterForm({
    onSuccess: (_data, form) => {
      autoContinueRef.current = setTimeout(() => continueWithRegisterData(form), REGISTER_AUTO_CONTINUE_MS);
    },
  });

  const continueAfterRegister = () => {
    clearTimeout(autoContinueRef.current);
    continueWithRegisterData(register.form);
  };

  return { mode, setMode: setModeState, login, register, continueAfterRegister };
};
