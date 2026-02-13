import React from "react";

const AdminMenu = () => {
  const handleLogout = () => {
    localStorage.removeItem("token"); // Eliminar el token del localStorage al cerrar sesión
    localStorage.removeItem("role");
    window.location.href = "/"; // Redirigir al login
  };

  return (
    <div>
      <h2>Panel Administrativo eCommerce</h2>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <button onClick={handleLogout}>Cerrar Sesión</button>
      </div>

      <p>Este panel está enfocado al roadmap de eCommerce.</p>
      <ul>
        <li>Módulo de productos (pendiente)</li>
        <li>Módulo de inventario (pendiente)</li>
        <li>Módulo de pedidos (pendiente)</li>
        <li>Módulo de clientes (pendiente)</li>
      </ul>
    </div>
  );
};

export default AdminMenu;
