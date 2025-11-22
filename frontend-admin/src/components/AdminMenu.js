import React, { useState, useEffect } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";

const AdminMenu = () => {
  const [posts, setPosts] = useState([]); // Estado para almacenar los posts
  const navigate = useNavigate();
  // Obtener el token desde localStorage
  const token = localStorage.getItem("token");
  // Configuración de los headers de autorización con el token JWT
  const config = {
    headers: {
      Authorization: `Bearer ${token}`, // Incluir el token en el header Authorization
    },
  };

  // Función para obtener los posts desde el backend
  const fetchPosts = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_HOST_SERVICES_URL}/api/posts`, config); // Cambia la URL si es necesario
      setPosts(response.data); // Guardar los posts en el estado
    } catch (error) {
      console.error("Error al obtener los posts", error);
    }
  };

  // useEffect para obtener los posts al cargar el componente
  useEffect(() => {
    fetchPosts();
  }, []);

  // Función para editar un post (navegar a la página de edición)
  const handleEdit = (postId) => {
    navigate(`/edit-post/${postId}`); // Redirigir a la página de edición de posts
  };

  const handleLogout = () => {
    localStorage.removeItem("token"); // Eliminar el token del localStorage al cerrar sesión
    window.location.href = "/"; // Redirigir al login
  };

  return (
    <div>
      <h2>Menú de Administrador</h2>

      {/* Enlace para crear un nuevo post */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <Link to="/create-post" className="btn btn-primary" style={{ padding: '0.5rem 1rem', background: 'linear-gradient(90deg, var(--FuenteSecundaria), var(--ColorSecundario))', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>Crear Nuevo Post</Link>
        <button onClick={handleLogout}>Cerrar Sesión</button>
      </div>

      {/* Tabla de posts */}
      <table>
        <thead>
          <tr>
            <th>Título</th>
            <th>Autor</th>
            <th>Fecha de Creación</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {posts.length > 0 ? (
            posts.map((post) => (
              <tr key={post._id}>
                <td>{post.title}</td>
                <td>{post.author.name || post.author.email}</td> {/* Autor del post */}
                <td>{new Date(post.createdAt).toLocaleDateString()}</td>
                <td>
                  {/* Botón para editar el post */}
                  <button onClick={() => handleEdit(post._id)} className="btn btn-secondary">
                    Editar
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4">No hay posts disponibles</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default AdminMenu;
