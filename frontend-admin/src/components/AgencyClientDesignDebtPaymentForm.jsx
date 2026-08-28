import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const formatCurrency = (value) => `$${Number(value || 0).toLocaleString()}`;

const AgencyClientDesignDebtPaymentForm = () => {
  const navigate = useNavigate();
  const { id, debtId } = useParams();

  const [debt, setDebt] = useState(null);
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDebt, setIsLoadingDebt] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    const loadDebt = async () => {
      setIsLoadingDebt(true);
      setError("");
      try {
        // No existe un GET de una sola deuda: se pide el historial completo del
        // cliente y se busca la deuda por id, igual que ya hace AgencyClientDetail.
        const response = await axios.get(`${baseUrl}/api/agency-clients/${id}/design-debts`, {
          headers: getAuthHeaders(),
        });
        const found = (response.data?.items || []).find((item) => item._id === debtId);
        if (!found) {
          setError("Deuda no encontrada.");
          return;
        }
        setDebt(found);
      } catch (err) {
        setError(err.response?.data?.error?.message || "No fue posible cargar la deuda.");
      } finally {
        setIsLoadingDebt(false);
      }
    };
    loadDebt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, debtId]);

  const remaining = debt ? debt.amount - debt.amountPaid : 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!debt) return;

    const parsedAmount = Number(amount);
    if (!(parsedAmount > 0)) {
      setError("El monto del abono debe ser mayor a 0.");
      return;
    }
    if (parsedAmount > remaining) {
      setError(`El abono no puede superar el saldo pendiente (${formatCurrency(remaining)}).`);
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      await axios.put(
        `${baseUrl}/api/agency-clients/${id}/design-debts/${debtId}`,
        { amountPaid: debt.amountPaid + parsedAmount },
        { headers: { ...getAuthHeaders(), "Content-Type": "application/json" } }
      );
      navigate(`/admin/agency-clients/${id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible registrar el abono.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section style={{ maxWidth: 500 }}>
      <div style={{ marginBottom: "1rem" }}>
        <button type="button" className="btn-secondary" onClick={() => navigate(`/admin/agency-clients/${id}`)} style={{ width: "auto" }}>
          ← Volver a la ficha
        </button>
      </div>

      <h3>Registrar abono a deuda</h3>

      {error ? <div className="auth-error">{error}</div> : null}

      {isLoadingDebt ? <p>Cargando...</p> : null}

      {debt ? (
        <>
          <p>
            {debt.description}
            <br />
            Total: {formatCurrency(debt.amount)} · Pagado: {formatCurrency(debt.amountPaid)} · Pendiente:{" "}
            {formatCurrency(remaining)}
          </p>

          <form onSubmit={handleSubmit} style={{ maxWidth: "none", margin: 0 }}>
            <label>
              Monto del abono
              <input
                type="number"
                min="0.01"
                max={remaining}
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Máximo ${formatCurrency(remaining)}`}
              />
            </label>
            <button type="submit" disabled={isLoading} style={{ width: "auto" }}>
              {isLoading ? "Guardando..." : "Registrar abono"}
            </button>
          </form>
        </>
      ) : null}
    </section>
  );
};

export default AgencyClientDesignDebtPaymentForm;
