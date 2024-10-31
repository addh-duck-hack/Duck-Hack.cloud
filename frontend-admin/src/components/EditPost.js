import React, { useState, useEffect } from "react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";

const EditPost = () => {
  const { id } = useParams(); // Obtener el id del post desde la URL
  const [post, setPost] = useState({ title: "", content: "" });
  const navigate = useNavigate();
  // Obtener el token desde localStorage
  const token = localStorage.getItem("token");
  // Configuración de los headers de autorización con el token JWT
  const config = {
    headers: {
      Authorization: `Bearer ${token}`, // Incluir el token en el header Authorization
    },
  };

  useEffect(() => {
    // Obtener los datos del post por ID
    const fetchPost = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_HOST_SERVICES_URL}/api/posts/${id}`, config);
        setPost(response.data); // Establecer el estado con los datos del post
      } catch (error) {
        console.error("Error al obtener el post", error);
      }
    };
    fetchPost();
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setPost({
      ...post,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${process.env.REACT_APP_HOST_SERVICES_URL}/api/posts/${id}`, post, config); // Actualizar el post
      navigate("/admin"); // Redirigir al menú de administrador después de la edición
    } catch (error) {
      console.error("Error al actualizar el post", error);
    }
  };

  return (
    <div>
      <h2>Editar Post</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="title">Título:</label>
          <input
            type="text"
            id="title"
            name="title"
            value={post.title}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label htmlFor="content">Contenido:</label>
          <textarea
            id="content"
            name="content"
            value={post.content}
            onChange={handleChange}
            required
          />
        </div>
        <button type="submit">Guardar Cambios</button>
      </form>
    </div>
  );
};

export default EditPost;
