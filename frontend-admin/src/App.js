import React from "react";
import { HashRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import AdminMenu from "./components/AdminMenu";
import Login from "./components/Login";
import RegisterUser from "./components/RegisterUser";
import './index.css';

const App = () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const adminRoles = ["super_admin", "store_admin", "catalog_manager", "order_manager"];
  const isLoggedIn = !!token && adminRoles.includes(role); // Verificar token y rol permitido

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={isLoggedIn ? <Navigate to="/admin" /> : <Login />} />
          <Route path="/admin" element={isLoggedIn ? <AdminMenu /> : <Navigate to="/" />} />
          <Route path="/register" element={<RegisterUser />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
