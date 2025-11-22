import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const CreatePost = () => {
  const [postData, setPostData] = useState({
    title: "",
    content: "",
    tags: "",
    published: false,
  });
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  // Obtener el token desde localStorage
  const token = localStorage.getItem("token");

  // Manejar cambios en los inputs del formulario
  const handleChange = (e) => {
    const { name, value } = e.target;
    setPostData({
      ...postData,
      [name]: value,
    });
  };

  // Manejar el envío del formulario
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Validación mínima
      if (!postData.title.trim() || !postData.content.trim()) {
        setMessage('El título y el contenido son obligatorios');
        return;
      }
      setIsSubmitting(true);
      // Enviar los datos del post al backend
      const response = await axios.post(
        `${process.env.REACT_APP_HOST_SERVICES_URL}/api/posts`,
        {
          title: postData.title,
          content: postData.content,
          tags: postData.tags ? postData.tags.split(",").map((tag) => tag.trim()) : [], // Separar etiquetas por comas
          published: postData.published,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`, // Enviar el token en los headers
          },
        }
      );
      setMessage("Post creado exitosamente");
      setIsSubmitting(false);
      navigate("/admin"); // Redirigir al menú de administración después de crear el post
    } catch (error) {
      console.error("Error al crear el post", error);
      setMessage("Error al crear el post. Inténtalo nuevamente.");
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h2>Crear Nuevo Post</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="title">Título:</label>
          <input
            type="text"
            id="title"
            name="title"
            value={postData.title}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label htmlFor="content">Contenido:</label>
          <textarea
            id="content"
            name="content"
            value={postData.content}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label htmlFor="tags">Etiquetas (separadas por comas):</label>
          <input
            type="text"
            id="tags"
            name="tags"
            value={postData.tags}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="published">Publicar ahora:</label>
          <input
            type="checkbox"
            id="published"
            name="published"
            checked={postData.published}
            onChange={(e) => setPostData({ ...postData, published: e.target.checked })}
          />
        </div>
        <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creando...' : 'Crear Post'}</button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
};

export default CreatePost;
