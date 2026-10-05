// 404 del panel: cualquier ruta que no exista. Dentro de /admin/* se renderiza
// en el <Outlet/> de AdminShell (con menú); fuera, sola y centrada
// (`standalone`). Antes una ruta desconocida dejaba la pantalla en negro.
import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./NotFound.css";

const NotFound = ({ standalone = false }) => {
  const location = useLocation();
  const isLoggedIn = !!localStorage.getItem("token");

  return (
    <div className={`not-found${standalone ? " is-standalone" : ""}`}>
      <div className="not-found-code">404</div>
      <h2>Página no encontrada</h2>
      <p className="not-found-path">
        <b>{location.pathname}</b>
      </p>
      <p>La dirección no existe o se movió. Revisa que esté bien escrita o vuelve al inicio.</p>
      <Link to={isLoggedIn ? "/admin" : "/"} className="not-found-home">
        <i className="fas fa-home" aria-hidden="true" /> {isLoggedIn ? "Ir al inicio del panel" : "Ir a iniciar sesión"}
      </Link>
    </div>
  );
};

export default NotFound;
