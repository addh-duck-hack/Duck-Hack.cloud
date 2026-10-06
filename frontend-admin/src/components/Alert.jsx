import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./Alert.css";

// Resultado de una acción (error / éxito): además del aviso en su lugar de
// siempre, abre un modal para que se vea aunque la persona haya hecho scroll
// (un "Error de validación" arriba del formulario pasaba desapercibido al
// guardar desde abajo). Se usa igual que el <div className="auth-error"> de
// antes: `{error ? <Alert type="error">{error}</Alert> : null}`.
// - Error: se cierra con "Entendido", Escape o clic afuera.
// - Éxito: se cierra solo a los 4 s (o antes con el botón).
// - Si el mensaje cambia, o el aviso desaparece y vuelve (lo normal: cada
//   envío limpia el error y lo vuelve a poner), el modal se abre otra vez.
// Avisos permanentes (ej. "no hay método de pago activo") siguen siendo un
// <div className="auth-error"> sin modal.

const SUCCESS_MS = 4000;

const Alert = ({ type = "error", children }) => {
  const [open, setOpen] = useState(true);
  const buttonRef = useRef(null);
  const text = typeof children === "string" ? children : null;
  const isError = type === "error";

  useEffect(() => setOpen(true), [text]);

  useEffect(() => {
    if (!open) return undefined;
    buttonRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    // Captura: que el Escape cierre este aviso y no el diálogo de abajo.
    window.addEventListener("keydown", onKey, true);
    const timer = isError ? null : setTimeout(() => setOpen(false), SUCCESS_MS);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (timer) clearTimeout(timer);
    };
  }, [open, isError]);

  return (
    <>
      <div className={`auth-${isError ? "error" : "success"}`}>{children}</div>
      {open
        ? createPortal(
            <div className="alert-backdrop" onClick={() => setOpen(false)}>
              <div
                className={`alert-modal alert-modal--${isError ? "error" : "success"}`}
                role={isError ? "alertdialog" : "status"}
                aria-modal="true"
                aria-labelledby="alert-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <i className={`fa-solid ${isError ? "fa-circle-exclamation" : "fa-circle-check"} alert-modal-icon`} aria-hidden="true" />
                <h4 id="alert-modal-title">{isError ? "No se pudo completar" : "Listo"}</h4>
                <div className="alert-modal-body">{children}</div>
                <button type="button" ref={buttonRef} onClick={() => setOpen(false)}>
                  {isError ? "Entendido" : "Aceptar"}
                </button>
                {!isError ? <span className="alert-modal-timer" style={{ animationDuration: `${SUCCESS_MS}ms` }} /> : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
};

export default Alert;
