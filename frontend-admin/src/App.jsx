import React, { Suspense, lazy } from "react";
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
import StoreConfigContact from "./components/StoreConfigContact";
import StoreConfigPayments from "./components/StoreConfigPayments";
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
import InvoiceEditForm from "./components/InvoiceEditForm";
import ProductList from "./components/ProductList";
import ProductForm from "./components/ProductForm";
import CategoryList from "./components/CategoryList";
import CategoryForm from "./components/CategoryForm";
import CouponList from "./components/CouponList";
import CouponForm from "./components/CouponForm";
import ReviewList from "./components/ReviewList";
import ServiceList from "./components/ServiceList";
import ServiceForm from "./components/ServiceForm";
import SpecialistList from "./components/SpecialistList";
import SpecialistForm from "./components/SpecialistForm";
import TimeBlockList from "./components/TimeBlockList";
import AppointmentSettingsForm from "./components/AppointmentSettingsForm";
import { isAgendaManager } from "./utils/schedule";
import InventoryList from "./components/InventoryList";
import InventoryForm from "./components/InventoryForm";
import OrderList from "./components/OrderList";
import OrderForm from "./components/OrderForm";
import OrderDetail from "./components/OrderDetail";
import UserList from "./components/UserList";
import UserCreateForm from "./components/UserCreateForm";
import UserForm from "./components/UserForm";
import MediaLibrary from "./components/MediaLibrary";
import AppHomeEditor from "./components/AppHomeEditor";
import PermissionsManager from "./components/PermissionsManager";
import Loader from "./components/Loader";

// La agenda trae FullCalendar (~300 kB): se carga solo al abrirla.
const AppointmentCalendar = lazy(() => import("./components/AppointmentCalendar"));
import NotFound from "./components/NotFound";
import { StoreConfigProvider } from "./hooks/useStoreConfig";
import { PermissionsProvider, usePermissions } from "./hooks/usePermissions";
import { ROLES, STAFF_ROLES } from "./utils/roles";
import { firstAllowedPath } from "./utils/permissions";
import './index.css';

// Staff sin ningún módulo permitido (ej. el super_admin aún no le asigna nada a su rol).
const NoModules = () => (
  <div>
    <h2>Sin módulos disponibles</h2>
    <p>Tu usuario todavía no tiene acceso a ningún módulo del panel. Pide al administrador que te asigne permisos.</p>
  </div>
);

const AppRoutes = () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const isLoggedIn = !!token && STAFF_ROLES.includes(role); // Verificar token y rol permitido
  const isSuperAdmin = !!token && role === ROLES.SUPER_ADMIN;
  // Módulos por tienda (contratados + por rol) — ver hooks/usePermissions.jsx.
  const { can, isLoading: permissionsLoading } = usePermissions();
  const gate = (key, element) => {
    if (permissionsLoading) return <Loader />;
    return can(key) ? element : <Navigate to="/admin" replace />;
  };
  // Dentro de Citas: especialistas y ajustes solo para la administración
  // (super_admin / store_admin); el backend lo vuelve a revisar.
  const gateManagers = (key, element) => {
    if (permissionsLoading) return <Loader />;
    return can(key) && isAgendaManager(role) ? element : <Navigate to="/admin" replace />;
  };
  // "Permisos": siempre solo super_admin.
  const superOnly = (element) => (isSuperAdmin ? element : <Navigate to="/admin" replace />);
  const landing = () => {
    if (permissionsLoading) return <Loader />;
    const path = firstAllowedPath(can, role);
    return path ? <Navigate to={path} replace /> : <NoModules />;
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={isLoggedIn ? <Navigate to="/admin" /> : <Login />} />
          <Route path="/register" element={<RegisterUser />} />

          <Route path="/admin" element={isLoggedIn ? <AdminShell /> : <Navigate to="/" />}>
            {/* El índice es el Panel (uso de servidor/infraestructura, ver
                AdminMenu.jsx), módulo "panel"; sin él se cae al primer módulo
                permitido (Pedidos si lo tiene). */}
            <Route index element={permissionsLoading ? <Loader /> : can("panel") ? <AdminMenu /> : landing()} />
            <Route
              path="store-config"
              element={gate("storeConfig", <StoreConfigManager />)}
            />
            <Route
              path="store-config/home"
              element={gate("storeConfig", <StoreConfigHome />)}
            />
            <Route
              path="store-config/servicios-precios"
              element={gate("storeConfig", <StoreConfigServicesPricing />)}
            />
            <Route
              path="store-config/equipo-testimonios"
              element={gate("storeConfig", <StoreConfigTeamTestimonials />)}
            />
            <Route
              path="store-config/contacto"
              element={gate("storeConfig", <StoreConfigContact />)}
            />
            <Route
              path="store-config/legal"
              element={gate("storeConfig", <StoreConfigLegal />)}
            />
            <Route
              path="store-config/pagos"
              element={gate("storeConfig", <StoreConfigPayments />)}
            />
            {/* "Entrega y pago" se juntó con "Pagos y ventas" (enlaces viejos). */}
            <Route path="store-config/entrega-pago" element={<Navigate to="/admin/store-config/pagos" replace />} />
            <Route
              path="agency-clients"
              element={gate("agencyClients", <AgencyClientList />)}
            />
            <Route
              path="agency-clients/new"
              element={gate("agencyClients", <AgencyClientForm />)}
            />
            <Route
              path="agency-clients/:id"
              element={gate("agencyClients", <AgencyClientDetail />)}
            />
            <Route
              path="agency-clients/:id/edit"
              element={gate("agencyClients", <AgencyClientForm />)}
            />
            <Route
              path="agency-clients/:id/hosting-payments/new"
              element={gate("agencyClients", <AgencyClientHostingPaymentForm />)}
            />
            <Route
              path="agency-clients/:id/design-debts/new"
              element={gate("agencyClients", <AgencyClientDesignDebtForm />)}
            />
            <Route
              path="agency-clients/:id/design-debts/:debtId/payment"
              element={gate("agencyClients", <AgencyClientDesignDebtPaymentForm />)}
            />
            <Route
              path="accounting"
              element={gate("accounting", <AccountingDashboard />)}
            />
            <Route
              path="accounting/transactions"
              element={gate("accounting", <AccountingTransactions />)}
            />
            <Route
              path="invoices"
              element={gate("invoices", <InvoiceList />)}
            />
            <Route
              path="invoices/new"
              element={gate("invoices", <InvoiceForm />)}
            />
            <Route
              path="invoices/:id/edit"
              element={gate("invoices", <InvoiceEditForm />)}
            />
            <Route
              path="products"
              element={gate("products", <ProductList />)}
            />
            <Route
              path="products/new"
              element={gate("products", <ProductForm />)}
            />
            <Route
              path="products/:id/edit"
              element={gate("products", <ProductForm />)}
            />
            <Route
              path="categories"
              element={gate("products", <CategoryList />)}
            />
            <Route
              path="categories/new"
              element={gate("products", <CategoryForm />)}
            />
            <Route
              path="categories/:id/edit"
              element={gate("products", <CategoryForm />)}
            />
            <Route
              path="appointments"
              element={gate(
                "appointments",
                <Suspense fallback={<Loader />}>
                  <AppointmentCalendar />
                </Suspense>
              )}
            />
            <Route
              path="specialists"
              element={gateManagers("appointments", <SpecialistList />)}
            />
            <Route
              path="specialists/new"
              element={gateManagers("appointments", <SpecialistForm />)}
            />
            <Route
              path="specialists/:id/edit"
              element={gateManagers("appointments", <SpecialistForm />)}
            />
            <Route
              path="time-blocks"
              element={gate("appointments", <TimeBlockList />)}
            />
            <Route
              path="appointment-settings"
              element={gateManagers("appointments", <AppointmentSettingsForm />)}
            />
            <Route
              path="services"
              element={gate("services", <ServiceList />)}
            />
            <Route
              path="services/new"
              element={gate("services", <ServiceForm />)}
            />
            <Route
              path="services/:id/edit"
              element={gate("services", <ServiceForm />)}
            />
            <Route
              path="service-categories"
              element={gate("services", <CategoryList kind="service" />)}
            />
            <Route
              path="service-categories/new"
              element={gate("services", <CategoryForm kind="service" />)}
            />
            <Route
              path="service-categories/:id/edit"
              element={gate("services", <CategoryForm kind="service" />)}
            />
            <Route
              path="coupons"
              element={gate("coupons", <CouponList />)}
            />
            <Route
              path="coupons/new"
              element={gate("coupons", <CouponForm />)}
            />
            <Route
              path="coupons/:id/edit"
              element={gate("coupons", <CouponForm />)}
            />
            <Route
              path="reviews"
              element={gate("reviews", <ReviewList />)}
            />
            <Route
              path="inventory"
              element={gate("inventory", <InventoryList />)}
            />
            <Route
              path="inventory/new"
              element={gate("inventory", <InventoryForm />)}
            />
            <Route
              path="inventory/:id/edit"
              element={gate("inventory", <InventoryForm />)}
            />
            <Route
              path="orders"
              element={gate("orders", <OrderList />)}
            />
            <Route
              path="orders/new"
              element={gate("orders", <OrderForm />)}
            />
            <Route
              path="orders/:id"
              element={gate("orders", <OrderDetail />)}
            />
            <Route
              path="media"
              element={gate("media", <MediaLibrary />)}
            />
            {/* "Configurar App" (módulo "appConfig"): configuración de la app
                móvil, una pestaña por configuración (ver AppConfigTabs.jsx). */}
            <Route
              path="app-config"
              element={gate("appConfig", <Navigate to="/admin/app-config/home" replace />)}
            />
            <Route
              path="app-config/home"
              element={gate("appConfig", <AppHomeEditor />)}
            />
            {/* Ruta anterior a "Configurar App" (enlaces viejos). */}
            <Route path="app-home" element={<Navigate to="/admin/app-config/home" replace />} />
            {/* Permisos por tienda (módulos contratados + por rol) — solo super_admin. */}
            <Route path="permissions" element={superOnly(<PermissionsManager />)} />
            <Route
              path="users"
              element={gate("users", <UserList />)}
            />
            <Route
              path="users/new"
              element={gate("users", <UserCreateForm />)}
            />
            <Route
              path="users/:id/edit"
              element={gate("users", <UserForm />)}
            />
            {/* Cualquier otra ruta del panel: 404 dentro del shell (con menú). */}
            <Route path="*" element={<NotFound />} />
          </Route>
          {/* Rutas fuera de /admin que no existen: 404 sola. */}
          <Route path="*" element={<NotFound standalone />} />
        </Routes>
      </div>
    </Router>
  );
};

const App = () => (
  <StoreConfigProvider>
    <PermissionsProvider>
      <AppRoutes />
    </PermissionsProvider>
  </StoreConfigProvider>
);

export default App;
