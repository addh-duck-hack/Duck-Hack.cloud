// Compartido entre AccountingTransactions.jsx, InvoiceList.jsx y la sección
// de movimientos de AgencyClientDetail.jsx — antes duplicado en los primeros
// dos.
export const SOURCE_LABELS = {
  manual: "Manual",
  hosting_payment: "Pago de hosting",
  design_debt: "Deuda",
  opening_balance: "Saldo inicial",
  movements: "Movimientos seleccionados",
};

export const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
