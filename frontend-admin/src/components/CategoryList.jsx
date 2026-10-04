import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { CATEGORY_KINDS } from "../utils/categoryKinds";

// Categorías del catálogo: de productos (módulo "Productos" de los permisos)
// o de servicios (módulo "Servicios"), según `kind`. Las destacadas son las
// que el storefront muestra como bloques de "categorías destacadas"; el orden
// aplica en la tienda y en este listado.
const CategoryList = ({ kind = "product" }) => {
  const config = CATEGORY_KINDS[kind];
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = getApiBaseUrl();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`${baseUrl}/api/categories`, { headers: getAuthHeaders(), params: { kind } });
      setCategories(response.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible cargar las categorías.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar esta categoría?")) return;
    setError("");
    try {
      await axios.delete(`${baseUrl}/api/categories/${id}`, { headers: getAuthHeaders() });
      await loadCategories();
    } catch (err) {
      setError(err.response?.data?.error?.message || "No fue posible eliminar la categoría.");
    }
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>{kind === "service" ? "Categorías de servicios" : "Categorías"}</h3>
        <button type="button" onClick={() => navigate(`${config.basePath}/new`)} style={{ width: "auto" }}>
          Nueva categoría
        </button>
      </div>
      <p>{config.intro}</p>

      {error ? <div className="auth-error">{error}</div> : null}

      <table>
        <thead>
          <tr>
            <th></th>
            <th>Nombre</th>
            <th>Slug</th>
            <th>Orden</th>
            <th>{config.itemsLabel}</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && categories.length === 0 ? (
            <tr>
              <td colSpan={7}>Sin categorías registradas.</td>
            </tr>
          ) : null}
          {categories.map((c) => (
            <tr key={c._id}>
              <td>
                {c.image ? (
                  <img src={`${baseUrl}/${c.image}`} alt={c.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                ) : (
                  "—"
                )}
              </td>
              <td>
                {c.name}
                {c.featured ? (
                  <span className="badge badge-blue" style={{ marginLeft: "0.5rem" }}>
                    Destacada
                  </span>
                ) : null}
              </td>
              <td>{c.slug}</td>
              <td>{c.sortOrder ?? 0}</td>
              <td>{c.productCount ?? 0}</td>
              <td>
                <span className={`badge badge-${c.isActive === false ? "red" : "green"}`}>
                  {c.isActive === false ? "Inactiva" : "Activa"}
                </span>
              </td>
              <td style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" onClick={() => navigate(`${config.basePath}/${c._id}/edit`)}>
                  Editar
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleDelete(c._id)}
                  disabled={c.productCount > 0}
                  title={c.productCount > 0 ? config.inUseTitle : undefined}
                >
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

export default CategoryList;
