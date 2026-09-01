import React from "react";
import { HashRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import AdminShell from "./components/AdminShell";
import AdminMenu from "./components/AdminMenu";
import Login from "./components/Login";
import RegisterUser from "./components/RegisterUser";
import StoreConfigManager from "./components/StoreConfigManager";
import StoreConfigHome from "./components/StoreConfigHome";
import StoreConfigServicesPricing from "./components/StoreConfigServicesPricing";
import StoreConfigTeamTestimonials from "./components/StoreConfigTeamTestimonials";
import StoreConfigLegal from "./components/StoreConfigLegal";
import AgencyClientList from "./components/AgencyClientList";
import AgencyClientForm from "./components/AgencyClientForm";
import AgencyClientDetail from "./components/AgencyClientDetail";
import AgencyClientHostingPaymentForm from "./components/AgencyClientHostingPaymentForm";
import AgencyClientDesignDebtForm from "./components/AgencyClientDesignDebtForm";
import AgencyClientDesignDebtPaymentForm from "./components/AgencyClientDesignDebtPaymentForm";
import AccountingDashboard from "./components/AccountingDashboard";
import AccountingTransactions from "./components/AccountingTransactions";
import InvoiceList from "./components/InvoiceList";
import InvoiceForm from "./components/InvoiceForm";
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
              path="store-config/home"
              element={canManageStoreConfig ? <StoreConfigHome /> : <Navigate to="/admin" />}
            />
            <Route
              path="store-config/servicios-precios"
              element={canManageStoreConfig ? <StoreConfigServicesPricing /> : <Navigate to="/admin" />}
            />
            <Route
              path="store-config/equipo-testimonios"
              element={canManageStoreConfig ? <StoreConfigTeamTestimonials /> : <Navigate to="/admin" />}
            />
            <Route
              path="store-config/legal"
              element={canManageStoreConfig ? <StoreConfigLegal /> : <Navigate to="/admin" />}
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
            <Route
              path="agency-clients/:id/hosting-payments/new"
              element={canManageAgencyClients ? <AgencyClientHostingPaymentForm /> : <Navigate to="/admin" />}
            />
            <Route
              path="agency-clients/:id/design-debts/new"
              element={canManageAgencyClients ? <AgencyClientDesignDebtForm /> : <Navigate to="/admin" />}
            />
            <Route
              path="agency-clients/:id/design-debts/:debtId/payment"
              element={canManageAgencyClients ? <AgencyClientDesignDebtPaymentForm /> : <Navigate to="/admin" />}
            />
            <Route
              path="accounting"
              element={canManageAgencyClients ? <AccountingDashboard /> : <Navigate to="/admin" />}
            />
            <Route
              path="accounting/transactions"
              element={canManageAgencyClients ? <AccountingTransactions /> : <Navigate to="/admin" />}
            />
            <Route
              path="invoices"
              element={canManageAgencyClients ? <InvoiceList /> : <Navigate to="/admin" />}
            />
            <Route
              path="invoices/new"
              element={canManageAgencyClients ? <InvoiceForm /> : <Navigate to="/admin" />}
            />
          </Route>
        </Routes>
      </div>
    </Router>
  );
};

export default App;
