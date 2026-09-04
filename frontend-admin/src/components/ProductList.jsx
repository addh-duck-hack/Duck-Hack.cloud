import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";

const formatMxn = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const ProductList = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/products`, { headers: getAuthHeaders() });
      setProducts(response.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar los productos.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar este producto?")) return;
    setError("");
    try {
      await axios.delete(`${baseUrl}/api/products/${id}`, { headers: getAuthHeaders() });
      await loadProducts();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar el producto.");
    }
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>Productos</h3>
        <button type="button" onClick={() => navigate("/admin/products/new")} style={{ width: "auto" }}>
          Nuevo producto
        </button>
      </div>
      <p>Catálogo de la tienda pública — solo los productos activos se muestran en el storefront.</p>

      {error ? <div className="auth-error">{error}</div> : null}

      <table>
        <thead>
          <tr>
            <th></th>
            <th>Nombre</th>
            <th>SKU</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && products.length === 0 ? (
            <tr>
              <td colSpan={7}>Sin productos registrados.</td>
            </tr>
          ) : null}
          {products.map((p) => (
            <tr key={p._id}>
              <td style={{ position: "relative" }}>
                {p.images?.[0] ? (
                  <>
                    <img src={`${baseUrl}/${p.images[0]}`} alt={p.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                    {p.images.length > 1 ? (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          color: "var(--placeholder-color)",
                          display: "block",
                          textAlign: "center",
                        }}
                      >
                        +{p.images.length - 1}
                      </span>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td>{p.name}</td>
              <td>{p.sku}</td>
              <td>{p.category || "—"}</td>
              <td>{formatMxn(p.price)}</td>
              <td>
                <span className={`badge badge-${p.isActive === false ? "red" : "green"}`}>
                  {p.isActive === false ? "Inactivo" : "Activo"}
                </span>
              </td>
              <td style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" onClick={() => navigate(`/admin/products/${p._id}/edit`)}>
                  Editar
                </button>
                <button type="button" className="btn-secondary" onClick={() => handleDelete(p._id)}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default ProductList;
