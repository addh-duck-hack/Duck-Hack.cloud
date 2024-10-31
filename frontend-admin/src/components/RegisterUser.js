import React, { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";

const RegisterUser = () => {
  const [userData, setUserData] = useState({
    name: "",
    email: "",
    password: "",
    role: "user", // Puedes cambiar el valor predeterminado según el rol que desees
  });
  const [message, setMessage] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData({
      ...userData,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${process.env.REACT_APP_HOST_SERVICES_URL}/api/users/register`, userData);
      setMessage(response.data.message || "Usuario registrado correctamente");
      setUserData({
        name: "",
        email: "",
        password: "",
        role: "user", // Restablece el valor después de registrar
      });
    } catch (error) {
      setMessage(error.response?.data?.message || "Error al registrar el usuario");
    }
  };

  return (
    <div>
      <h2>Registrar Usuario</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name">Nombre:</label>
          <input
            type="text"
            id="name"
            name="name"
            value={userData.name}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label htmlFor="email">Correo Electrónico:</label>
          <input
            type="email"
            id="email"
            name="email"
            value={userData.email}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Contraseña:</label>
          <input
            type="password"
            id="password"
            name="password"
            value={userData.password}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label htmlFor="role">Rol:</label>
          <select
            id="role"
            name="role"
            value={userData.role}
            onChange={handleChange}
            required
          >
            <option value="user">Usuario</option>
            <option value="admin">Administrador</option>
            <option value="editor">Editor</option>
          </select>
        </div>
        <button type="submit">Registrar</button>
      </form>
      {message && <p>{message}</p>}

      <p>
        ¿Ya tienes una cuenta? <Link to="/">Login</Link>
      </p>
    </div>
  );
};

export default RegisterUser;
