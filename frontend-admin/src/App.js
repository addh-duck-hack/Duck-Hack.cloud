import React from "react";
import { HashRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import AdminShell from "./components/AdminShell";
import AdminMenu from "./components/AdminMenu";
import Login from "./components/Login";
import RegisterUser from "./components/RegisterUser";
import StoreConfigManager from "./components/StoreConfigManager";
import AgencyClientList from "./components/AgencyClientList";
import AgencyClientForm from "./components/AgencyClientForm";
import AgencyClientDetail from "./components/AgencyClientDetail";
import './index.css';

const App = () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const adminRoles = ["super_admin", "store_admin", "catalog_manager", "order_manager"];
  const storeConfigRoles = ["super_admin", "store_admin"];
  const agencyClientRoles = ["super_admin"];
  const isLoggedIn = !!token && adminRoles.includes(role); // Verificar token y rol permitido
  const canManageStoreConfig = !!token && storeConfigRoles.includes(role);
  const canManageAgencyClients = !!token && agencyClientRoles.includes(role);

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={isLoggedIn ? <Navigate to="/admin" /> : <Login />} />
          <Route path="/register" element={<RegisterUser />} />

          <Route path="/admin" element={isLoggedIn ? <AdminShell /> : <Navigate to="/" />}>
            <Route index element={<AdminMenu />} />
            <Route
              path="store-config"
              element={canManageStoreConfig ? <StoreConfigManager /> : <Navigate to="/admin" />}
            />
            <Route
              path="agency-clients"
              element={canManageAgencyClients ? <AgencyClientList /> : <Navigate to="/admin" />}
            />
            <Route
              path="agency-clients/new"
              element={canManageAgencyClients ? <AgencyClientForm /> : <Navigate to="/admin" />}
            />
            <Route
              path="agency-clients/:id"
              element={canManageAgencyClients ? <AgencyClientDetail /> : <Navigate to="/admin" />}
            />
            <Route
              path="agency-clients/:id/edit"
              element={canManageAgencyClients ? <AgencyClientForm /> : <Navigate to="/admin" />}
            />
          </Route>
        </Routes>
      </div>
    </Router>
  );
};

export default App;
