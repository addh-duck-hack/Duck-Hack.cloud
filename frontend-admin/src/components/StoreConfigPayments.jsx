import React, { useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { MEXICAN_BANKS } from "../utils/mexicanBanks";
import StoreConfigTabs from "./StoreConfigTabs";

const initialState = {
  accountHolderName: "",
  clabe: "",
  phone: "",
  bank: "",
};

const StoreConfigPayments = () => {
  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const mapApiToForm = (data) => ({
    accountHolderName: data?.speiPayment?.accountHolderName || "",
    clabe: data?.speiPayment?.clabe || "",
    phone: data?.speiPayment?.phone || "",
    bank: data?.speiPayment?.bank || "",
  });

  const loadConfig = async () => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.get(`${baseUrl}/api/store-config`, { headers: getAuthHeaders() });
      setForm(mapApiToForm(response.data));
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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.put(
        `${baseUrl}/api/store-config`,
        { speiPayment: { ...form } },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      setForm(mapApiToForm(response.data?.storeConfig));
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
      <h3>Pagos (SPEI)</h3>
      <p>
        Cuenta a la que los clientes deben transferir por SPEI para pagar sus pedidos. Estos datos no se
        muestran públicamente en la tienda — se usarán para incluirlos en el correo de confirmación de
        pedido que recibe el comprador.
      </p>

      {message ? <div className="auth-success">{message}</div> : null}
      {error ? <div className="auth-error">{error}</div> : null}

      <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Nombre completo
            <input
              type="text"
              name="accountHolderName"
              value={form.accountHolderName}
              onChange={handleChange}
              maxLength={160}
            />
          </label>
          <label>
            Banco receptor
            <select name="bank" value={form.bank} onChange={handleChange}>
              <option value="">Selecciona un banco</option>
              {MEXICAN_BANKS.map((bankName) => (
                <option key={bankName} value={bankName}>
                  {bankName}
                </option>
              ))}
            </select>
          </label>
          <label>
            CLABE interbancaria
            <input
              type="text"
              name="clabe"
              value={form.clabe}
              onChange={handleChange}
              maxLength={18}
              inputMode="numeric"
              placeholder="18 dígitos"
            />
          </label>
          <label>
            Número de celular
            <input type="tel" name="phone" value={form.phone} onChange={handleChange} maxLength={20} />
          </label>
        </div>

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
