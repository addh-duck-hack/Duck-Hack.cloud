// Mensajes legibles para un ValidationError de Mongoose. El panel solo pinta
// `error.message`, así que el motivo tiene que ir ahí (antes iba un genérico
// "Error de validación" y el detalle se perdía en `details`, en inglés y con
// el valor completo del campo, ej. toda la descripción HTML).
//
// describeValidationError(error) → { message, details }: `details` = un
// mensaje por campo; `message` = el único o "Revisa estos datos: a; b".
// Los validadores propios de los esquemas ya traen su mensaje en español y
// se respetan tal cual.

// Cómo nombrar en español los campos más comunes (último tramo de la ruta).
const FIELD_LABELS = {
  name: "El nombre",
  title: "El título",
  description: "La descripción",
  sku: "El SKU",
  price: "El precio",
  compareAtPrice: "El precio comparativo",
  quantity: "La cantidad",
  category: "La categoría",
  images: "Las imágenes",
  email: "El correo",
  phone: "El teléfono",
  customerName: "El nombre de la clienta",
  customerEmail: "El correo de la clienta",
  customerPhone: "El teléfono de la clienta",
  notes: "Las notas",
  staffNotes: "Las notas internas",
  comment: "El comentario",
  code: "El código",
  amount: "El monto",
  label: "La etiqueta",
  value: "El valor",
  url: "El enlace",
  address: "La dirección",
  street: "La calle",
  zipCode: "El código postal",
  city: "La ciudad",
  state: "El estado",
  storeName: "El nombre de la tienda",
  businessName: "El nombre del negocio",
  durationMin: "La duración",
  sortOrder: "El orden",
};

// "variants.2.sku" → "El SKU (renglón 3 de variants)".
const labelFor = (path = "") => {
  const parts = String(path).split(".");
  const field = parts[parts.length - 1];
  const base = FIELD_LABELS[field] || `El campo "${field}"`;
  const indexAt = parts.findIndex((p) => /^\d+$/.test(p));
  return indexAt > 0 ? `${base} (renglón ${Number(parts[indexAt]) + 1} de ${parts[indexAt - 1]})` : base;
};

const describeOne = (err) => {
  const label = labelFor(err?.path);
  const props = err?.properties || {};
  switch (err?.kind) {
    case "required":
      return `${label} es obligatorio.`;
    case "maxlength": {
      const length = typeof err.value === "string" ? ` (tiene ${err.value.length})` : "";
      return `${label} admite hasta ${props.maxlength} caracteres${length}.`;
    }
    case "minlength":
      return `${label} debe tener al menos ${props.minlength} caracteres.`;
    case "min":
      return `${label} debe ser ${props.min} o más.`;
    case "max":
      return `${label} debe ser ${props.max} o menos.`;
    case "enum":
      return `${label} tiene un valor que no está permitido.`;
    case "regexp":
      return `${label} no tiene un formato válido.`;
    default:
      // CastError (texto donde va un número, id mal formado…).
      if (err?.name === "CastError") return `${label} no tiene un formato válido.`;
      // Validador propio del esquema: su mensaje ya es para personas.
      return err?.message || `${label} no es válido.`;
  }
};

const describeValidationError = (error) => {
  const details = Object.values(error?.errors || {}).map(describeOne);
  if (!details.length) return { message: "Revisa los datos del formulario.", details };
  return { message: details.length === 1 ? details[0] : `Revisa estos datos: ${details.join("; ")}`, details };
};

module.exports = { describeValidationError };
