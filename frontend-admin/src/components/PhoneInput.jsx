import React from "react";
import { normalizeMxPhone } from "../utils/phone";

// Campo de teléfono de México: solo dígitos, máximo 10 (al pegar "+52 55 1234
// 5678" queda "5512345678"). El backend aplica la misma regla
// (packages/core-api/lib/phone.js). `onChange` recibe un evento con
// target.name / target.value (los dígitos), para usarlo con los handleChange
// de siempre. `prefix` muestra un texto fijo antes (p. ej. "+52" en WhatsApp).
const PhoneInput = ({ name, value, onChange, required = false, prefix, id, placeholder = "10 dígitos", ...rest }) => {
  const digits = normalizeMxPhone(value);
  const missing = digits.length > 0 && digits.length < 10 ? 10 - digits.length : 0;

  const input = (
    <input
      {...rest}
      id={id}
      type="tel"
      name={name}
      value={digits}
      inputMode="numeric"
      autoComplete="tel-national"
      pattern="\d{10}"
      maxLength={13}
      title="10 dígitos, sin lada de país"
      placeholder={placeholder}
      required={required}
      onChange={(e) => onChange({ target: { name, value: normalizeMxPhone(e.target.value), type: "tel" } })}
    />
  );

  return (
    <>
      {prefix ? (
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ fontFamily: "var(--font-mono)", opacity: 0.8 }}>{prefix}</span>
          {input}
        </span>
      ) : (
        input
      )}
      {missing ? (
        <small style={{ color: "var(--primary-color)" }}>
          Faltan {missing} {missing === 1 ? "dígito" : "dígitos"} (deben ser 10).
        </small>
      ) : null}
    </>
  );
};

export default PhoneInput;
