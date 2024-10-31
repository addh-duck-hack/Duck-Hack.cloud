import React from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import AdminMenu from "./components/AdminMenu";
import Login from "./components/Login";
import RegisterUser from "./components/RegisterUser";
import CreatePost from "./components/CreatePost";
import EditPost from "./components/EditPost";
import './index.css';

const App = () => {
  const isLoggedIn = !!localStorage.getItem("token"); // Verificar si hay un token JWT en localStorage

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={isLoggedIn ? <Navigate to="/admin" /> : <Login />} />
          <Route path="/admin" element={isLoggedIn ? <AdminMenu /> : <Navigate to="/" />} />
          <Route path="/register" element={<RegisterUser />} />
          <Route path="/create-post" element={isLoggedIn ? <CreatePost /> : <Navigate to="/" />} />
          <Route path="/edit-post/:id" element={isLoggedIn ? <EditPost /> : <Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;

