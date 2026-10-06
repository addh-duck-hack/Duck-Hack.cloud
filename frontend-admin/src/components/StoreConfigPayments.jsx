import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { MEXICAN_BANKS } from "../utils/mexicanBanks";
import StoreConfigListEditor from "./StoreConfigListEditor";
import StoreConfigTabs from "./StoreConfigTabs";
import Alert from "./Alert";

// Pestaña "Ventas y pagos": límite de compra y lo que el cliente elige en el
// checkout de la tienda (pasos "Entrega" y "Pago"). Ver
// packages/core-api/lib/checkoutOptions.js, lib/shipping.js y
// lib/purchaseLimits.js.

// Mismas claves que ORDER_NOTIFICATION_KEYS en packages/core-api/modules/storeConfig.js.
const ORDER_NOTIFICATIONS = [
  { key: "confirmed", label: "Al cliente: pago confirmado (el pedido pasa a Pagado)" },
  { key: "proofRejected", label: "Al cliente: comprobante rechazado (con el motivo)" },
  { key: "shipped", label: "Al cliente: pedido enviado (con paquetería y guía)" },
  { key: "delivered", label: "Al cliente: pedido entregado" },
  { key: "readyForPickup", label: "Al cliente: pedido listo para recoger (con el punto de venta)" },
  { key: "pickedUp", label: "Al cliente: pedido recogido" },
  { key: "cancelled", label: "Al cliente: pedido cancelado" },
  { key: "proofUploaded", label: "A la tienda: el cliente subió un comprobante" },
];
const defaultOrderNotifications = Object.fromEntries(ORDER_NOTIFICATIONS.map(({ key }) => [key, true]));

const PICKUP_POINT_FIELDS = [
  { name: "name", label: "Nombre", type: "text", required: true, maxLength: 120, placeholder: "Finca Tacita" },
  { name: "schedule", label: "Horario", type: "text", maxLength: 200, placeholder: "Lun a sáb, 9:00 a 18:00" },
  { name: "address", label: "Dirección", type: "textarea", maxLength: 400, fullWidth: true },
  { name: "instructions", label: "Indicaciones para recoger", type: "textarea", maxLength: 500, fullWidth: true },
  { name: "lat", label: "Latitud (opcional)", type: "number", step: "any", min: -90, max: 90, placeholder: "20.2764" },
  { name: "lng", label: "Longitud (opcional)", type: "number", step: "any", min: -180, max: 180, placeholder: "-97.9577" },
  { name: "isActive", label: "Activo", type: "boolean" },
];

// `type` decide cómo se cobra; una pasarela de pago se agregaría aquí como
// otra opción cuando exista en el backend (PAYMENT_METHOD_TYPES).
const PAYMENT_METHOD_TYPE_OPTIONS = [
  { value: "spei", label: "Transferencia SPEI" },
  { value: "manual", label: "Manual (instrucciones propias)" },
];

const isSpei = (item) => item.type === "spei";
const isManual = (item) => item.type !== "spei";

const BANK_OPTIONS = [{ value: "", label: "Selecciona un banco" }, ...MEXICAN_BANKS.map((bank) => ({ value: bank, label: bank }))];

// Los datos de la cuenta SPEI viven en `spei` del método; en el formulario se
// aplanan (speiClabe, ...) porque el editor de listas maneja campos planos.
const PAYMENT_METHOD_FIELDS = [
  { name: "label", label: "Nombre", type: "text", required: true, maxLength: 80, placeholder: "Transferencia SPEI" },
  { name: "type", label: "Tipo", type: "select", options: PAYMENT_METHOD_TYPE_OPTIONS },
  { name: "description", label: "Descripción corta (se ve al elegirlo)", type: "text", maxLength: 200, fullWidth: true },
  { name: "speiAccountHolderName", label: "Titular de la cuenta", type: "text", maxLength: 160, showIf: isSpei },
  { name: "speiBank", label: "Banco receptor", type: "select", options: BANK_OPTIONS, required: true, showIf: isSpei },
  {
    name: "speiClabe",
    label: "CLABE interbancaria",
    type: "text",
    maxLength: 18,
    digitsOnly: true,
    required: true,
    placeholder: "18 dígitos",
    showIf: isSpei,
  },
  { name: "speiPhone", label: "Número de celular (opcional, 10 dígitos)", type: "mxPhone", showIf: isSpei },
  {
    name: "instructions",
    label: "Instrucciones (se muestran al confirmar y en el correo del pedido)",
    type: "textarea",
    maxLength: 1000,
    fullWidth: true,
    showIf: isManual,
  },
  { name: "forShipping", label: "Disponible con envío a domicilio", type: "boolean" },
  { name: "forPickup", label: "Disponible al recoger en punto de venta", type: "boolean" },
  { name: "isActive", label: "Activo", type: "boolean" },
];

const emptyPickupPoint = () => ({ name: "", schedule: "", address: "", instructions: "", lat: null, lng: null, isActive: true });

const emptyPaymentMethod = () => ({
  label: "",
  type: "spei",
  description: "",
  instructions: "",
  speiAccountHolderName: "",
  speiBank: "",
  speiClabe: "",
  speiPhone: "",
  forShipping: true,
  forPickup: true,
  isActive: true,
});

// Método del API → fila del formulario. Un SPEI sin cuenta propia muestra la
// cuenta general (speiPayment, de antes de que SPEI fuera un método), así al
// guardar queda en el método.
const methodToForm = (method, fallbackSpei) => {
  const { spei, ...rest } = method;
  const account = spei?.clabe ? spei : method.type === "spei" ? fallbackSpei : null;
  return {
    ...rest,
    speiAccountHolderName: account?.accountHolderName || "",
    speiBank: account?.bank || "",
    speiClabe: account?.clabe || "",
    speiPhone: account?.phone || "",
  };
};

const formToMethod = ({ speiAccountHolderName, speiBank, speiClabe, speiPhone, ...method }) =>
  method.type === "spei"
    ? { ...method, spei: { accountHolderName: speiAccountHolderName, bank: speiBank, clabe: speiClabe, phone: speiPhone } }
    : method;

// Lo que la tienda ofrece mientras no haya métodos guardados (mismo default
// que el backend, lib/checkoutOptions.js#DEFAULT_PAYMENT_METHODS).
const defaultPaymentMethods = (fallbackSpei) => [
  methodToForm(
    {
      type: "spei",
      label: "Transferencia / SPEI",
      description: "Te enviamos los datos por correo y confirmamos al recibir el pago.",
      instructions: "",
      forShipping: true,
      forPickup: true,
      isActive: true,
    },
    fallbackSpei
  ),
  methodToForm({
    type: "manual",
    label: "Pago al recoger",
    description: "Pagas al recoger tu pedido.",
    instructions: "Puedes pasar a recoger y pagar tu pedido; te escribimos para coordinar.",
    forShipping: false,
    forPickup: true,
    isActive: true,
  }),
];

const initialShipping = { enabled: false, cost: "", freeFrom: "" };

const StoreConfigPayments = () => {
  const [maxUnitsPerProduct, setMaxUnitsPerProduct] = useState("");
  const [homeDeliveryEnabled, setHomeDeliveryEnabled] = useState(true);
  const [shipping, setShipping] = useState(initialShipping);
  const [pickupPoints, setPickupPoints] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [orderNotifications, setOrderNotifications] = useState(defaultOrderNotifications);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [customerProofUpload, setCustomerProofUpload] = useState(false);
  const [usingDefaultMethods, setUsingDefaultMethods] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const applyConfig = (data) => {
    // null/0 = sin límite; se muestra vacío para que se lea así.
    setMaxUnitsPerProduct(data?.maxUnitsPerProduct ? String(data.maxUnitsPerProduct) : "");
    setHomeDeliveryEnabled(data?.homeDeliveryEnabled !== false);
    setLowStockAlerts(data?.lowStockAlerts !== false);
    setCustomerProofUpload(Boolean(data?.customerProofUpload));
    setOrderNotifications(
      Object.fromEntries(ORDER_NOTIFICATIONS.map(({ key }) => [key, data?.orderNotifications?.[key] !== false]))
    );
    setShipping({
      enabled: Boolean(data?.shipping?.enabled),
      cost: data?.shipping?.cost != null ? String(data.shipping.cost) : "",
      freeFrom: data?.shipping?.freeFrom ? String(data.shipping.freeFrom) : "",
    });
    setPickupPoints(data?.pickupPoints || []);
    const saved = data?.paymentMethods || [];
    setUsingDefaultMethods(saved.length === 0);
    setPaymentMethods(
      saved.length ? saved.map((m) => methodToForm(m, data?.speiPayment)) : defaultPaymentMethods(data?.speiPayment)
    );
  };

  const loadConfig = async () => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/store-config`, { headers: getAuthHeaders() });
      applyConfig(response.data);
      setMessage("Configuración cargada.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar la configuración.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShippingChange = (event) => {
    const { name, value, type, checked } = event.target;
    setShipping((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const hasActivePickupPoint = pickupPoints.some((p) => p.isActive !== false);
  const noDeliveryOption = !homeDeliveryEnabled && !hasActivePickupPoint;
  const noPaymentMethod = !paymentMethods.some((m) => m.isActive !== false);
  const speiWithoutClabe = paymentMethods.filter((m) => m.type === "spei" && m.isActive !== false && m.speiClabe.length !== 18);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.put(
        `${baseUrl}/api/store-config`,
        {
          maxUnitsPerProduct: maxUnitsPerProduct === "" ? null : Number(maxUnitsPerProduct),
          homeDeliveryEnabled,
          shipping: {
            enabled: shipping.enabled,
            cost: shipping.cost === "" ? null : Number(shipping.cost),
            freeFrom: shipping.freeFrom === "" ? null : Number(shipping.freeFrom),
          },
          pickupPoints,
          paymentMethods: paymentMethods.map(formToMethod),
          orderNotifications,
          lowStockAlerts,
          customerProofUpload,
        },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      applyConfig(response.data?.storeConfig);
      setMessage(response.data?.message || "Configuración guardada.");
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible guardar la configuración.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section style={{ maxWidth: 1300 }}>
      <StoreConfigTabs />
      <h3>Ventas y pagos</h3>
      <p>
        Cómo compran los clientes en la tienda: cuántas piezas pueden llevar, cómo reciben su pedido y cómo lo
        pagan.
      </p>

      {message ? <Alert type="success">{message}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}
      {noDeliveryOption ? (
        <div className="auth-error">
          No hay ninguna forma de entrega disponible: activa el envío a domicilio o agrega un punto de venta activo.
        </div>
      ) : null}
      {noPaymentMethod ? (
        <div className="auth-error">No hay ningún método de pago activo: los clientes no podrán comprar.</div>
      ) : null}
      {speiWithoutClabe.length ? (
        <div className="auth-error">
          Falta la CLABE (18 dígitos) en: {speiWithoutClabe.map((m) => m.label || "método SPEI").join(", ")}. Sin ella, el
          correo del pedido no incluye los datos para transferir.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <h4>Límite de compra</h4>
        <p>
          Máximo de piezas de un mismo producto que un cliente puede llevar en un pedido de la tienda. Para
          cantidades mayores, la tienda le ofrece contactarlos como cliente mayorista. Déjalo vacío o en 0 para no
          poner límite (solo se limita a las existencias del inventario).
        </p>
        <label style={{ maxWidth: 320 }}>
          Piezas máximas por producto
          <input
            type="number"
            value={maxUnitsPerProduct}
            onChange={(e) => setMaxUnitsPerProduct(e.target.value)}
            min={0}
            max={9999}
            step={1}
            inputMode="numeric"
            placeholder="Sin límite"
          />
        </label>

        <h4 style={{ marginTop: "2rem" }}>Envío a domicilio</h4>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={homeDeliveryEnabled}
            onChange={(e) => setHomeDeliveryEnabled(e.target.checked)}
            style={{ width: "auto" }}
          />
          Ofrecer envío a domicilio
        </label>

        {homeDeliveryEnabled ? (
          <div style={{ marginTop: "0.75rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                name="enabled"
                checked={shipping.enabled}
                onChange={handleShippingChange}
                style={{ width: "auto" }}
              />
              El envío tiene costo
            </label>
            {shipping.enabled ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.75rem" }}>
                  <label>
                    Costo de envío (MXN)
                    <input
                      type="number"
                      name="cost"
                      value={shipping.cost}
                      onChange={handleShippingChange}
                      min={1}
                      step="0.01"
                      inputMode="decimal"
                      required
                      placeholder="Ej. 99"
                    />
                  </label>
                  <label>
                    Envío gratis a partir de (MXN)
                    <input
                      type="number"
                      name="freeFrom"
                      value={shipping.freeFrom}
                      onChange={handleShippingChange}
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      placeholder="Sin envío gratis"
                    />
                  </label>
                </div>
                <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                  El mínimo se compara con el subtotal de productos (ya con descuentos). Déjalo vacío si el envío
                  nunca es gratis.
                </p>
              </>
            ) : (
              <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>El envío a domicilio es gratis en todos los pedidos.</p>
            )}
          </div>
        ) : null}

        <h4 style={{ marginTop: "2rem" }}>Puntos de venta (recoger en tienda)</h4>
        <p>
          Lugares donde el cliente puede recoger su pedido, sin costo de envío. La latitud y la longitud son
          opcionales; sirven para mostrar los puntos en un mapa.
        </p>
        <StoreConfigListEditor
          items={pickupPoints}
          onChange={setPickupPoints}
          itemLabel={(item) => item.name}
          fields={PICKUP_POINT_FIELDS}
          createEmptyItem={emptyPickupPoint}
          addButtonLabel="+ Agregar punto de venta"
        />

        <h4 style={{ marginTop: "2rem" }}>Métodos de pago</h4>
        <p>
          Cómo puede pagar el cliente; la tienda confirma cada pago a mano desde Pedidos. En los de tipo
          Transferencia SPEI captura la cuenta a la que se transfiere: se envía en el correo de confirmación del
          pedido y nunca se muestra en la tienda.
        </p>
        {usingDefaultMethods ? (
          <div className="auth-success">
            La tienda ofrece estos métodos por default. Revísalos y guarda para confirmarlos o cambiarlos.
          </div>
        ) : null}
        <StoreConfigListEditor
          items={paymentMethods}
          onChange={setPaymentMethods}
          itemLabel={(item) => (item.isActive === false ? `${item.label} (inactivo)` : item.label)}
          fields={PAYMENT_METHOD_FIELDS}
          createEmptyItem={emptyPaymentMethod}
          addButtonLabel="+ Agregar método de pago"
        />

        <h4 style={{ marginTop: "2rem" }}>Comprobantes de pago</h4>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={customerProofUpload}
            onChange={(e) => setCustomerProofUpload(e.target.checked)}
            style={{ width: "auto" }}
          />
          El cliente sube su comprobante de transferencia desde la tienda
        </label>
        <p style={{ marginTop: 0 }}>
          El correo de confirmación (y el de comprobante rechazado) llevan el botón "Subir mi comprobante" a la página del
          pedido en la tienda. Actívalo solo cuando la tienda ya tenga esa página; si no, el cliente recibiría un enlace roto.
          Apagado, el correo pide responder con el comprobante, como hasta ahora.
        </p>

        <h4 style={{ marginTop: "2rem" }}>Avisos por correo del pedido</h4>
        <p>
          Correos automáticos cuando cambia un pedido. El correo de confirmación al hacer el pedido y el aviso de pedido
          nuevo a la tienda se envían siempre.
        </p>
        {ORDER_NOTIFICATIONS.map(({ key, label }) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={orderNotifications[key]}
              onChange={(e) => setOrderNotifications((prev) => ({ ...prev, [key]: e.target.checked }))}
              style={{ width: "auto" }}
            />
            {label}
          </label>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" checked={lowStockAlerts} onChange={(e) => setLowStockAlerts(e.target.checked)} style={{ width: "auto" }} />
          A la tienda: un producto llegó a su mínimo de inventario o se agotó
        </label>

        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
          <button type="submit" disabled={isLoading} style={{ width: "auto" }}>
            {isLoading ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" onClick={loadConfig} disabled={isLoading} className="btn-secondary" style={{ width: "auto" }}>
            Recargar
          </button>
        </div>
      </form>
    </section>
  );
};

export default StoreConfigPayments;
