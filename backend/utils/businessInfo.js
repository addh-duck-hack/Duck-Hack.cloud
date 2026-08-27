// Datos fijos del negocio para el encabezado de la factura PDF.
// El comprobante NO tiene validez fiscal (no es CFDI); el RFC se incluye solo
// como referencia informativa.
const BUSINESS_INFO = {
  name: "Adrian Cabrera Jacobo",
  address: "Priv. Flor de azucena, No. 112, Paseos de Chavarría, Mineral de la Reforma, Hidalgo, CP. 42186",
  phone: "56 6165 3418",
  rfc: "CAJA911127IH1",
};

module.exports = { BUSINESS_INFO };
