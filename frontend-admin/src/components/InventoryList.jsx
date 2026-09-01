import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const STATUS_LABELS = {
  in_stock: { label: "En stock", color: "green" },
  low_stock: { label: "Stock bajo", color: "yellow" },
  out_of_stock: { label: "Sin stock", color: "red" },
};

const InventoryList = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/inventory`, { headers: getAuthHeaders() });
      setItems(response.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar el inventario.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar este registro de inventario?")) return;
    setError("");
    try {
      await axios.delete(`${baseUrl}/api/inventory/${id}`, { headers: getAuthHeaders() });
      await loadItems();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar el registro.");
    }
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Inventario</h3>
        <button type="button" onClick={() => navigate("/admin/inventory/new")} style={{ width: "auto" }}>
          Registrar inventario
        </button>
      </div>
      <p>Un registro por producto. El estado se calcula solo, no se edita directo.</p>

      {error ? <div className="auth-error">{error}</div> : null}

      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>SKU</th>
            <th>Cantidad</th>
            <th>Umbral de stock bajo</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && items.length === 0 ? (
            <tr>
              <td colSpan={6}>Sin inventario registrado.</td>
            </tr>
          ) : null}
          {items.map((item) => {
            const statusInfo = STATUS_LABELS[item.status] || { label: item.status, color: "" };
            return (
              <tr key={item._id}>
                <td>{item.product?.name || "—"}</td>
                <td>{item.product?.sku || "—"}</td>
                <td>{item.quantity}</td>
                <td>{item.lowStockThreshold}</td>
                <td>
                  <span className={`badge badge-${statusInfo.color}`}>{statusInfo.label}</span>
                </td>
                <td style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="button" onClick={() => navigate(`/admin/inventory/${item._id}/edit`)}>
                    Editar
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => handleDelete(item._id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};

export default InventoryList;
