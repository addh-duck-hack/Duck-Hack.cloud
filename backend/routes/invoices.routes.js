const express = require("express");
const router = express.Router();
const Invoice = require("../models/invoice.model");
const AgencyClient = require("../models/agencyClient.model");
const { verifyToken, authorizeRoles, ROLES } = require("../middleware/authMiddleware");
const { validateObjectIdParam, validateInvoicePayload } = require("../middleware/validationMiddleware");
const { sendError } = require("../utils/httpResponses");
const { getNextInvoiceFolio } = require("../utils/accountingHooks");
const { generateInvoicePdf } = require("../utils/invoicePdf");

// Confidencial: mismo criterio que /api/agency-clients, solo super_admin.
router.use(verifyToken, authorizeRoles(ROLES.SUPER_ADMIN));

const sanitizeDoc = (doc) => {
  if (!doc) return null;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete obj.__v;
  return obj;
};

router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.client) filter.client = req.query.client;

    const invoices = await Invoice.find(filter).sort({ folio: -1 }).populate("client", "businessName");
    return res.status(200).json({ items: invoices.map(sanitizeDoc) });
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar facturas.");
  }
});

router.post("/", validateInvoicePayload, async (req, res) => {
  try {
    const client = await AgencyClient.findById(req.body.client);
    if (!client) {
      return sendError(res, 404, "AGENCY_CLIENT_NOT_FOUND", "Cliente de agencia no encontrado.");
    }

    const folio = await getNextInvoiceFolio();
    const invoice = new Invoice({
      client: client._id,
      folio,
      concept: req.body.concept,
      amount: req.body.amount,
      issuedAt: req.body.issuedAt || new Date(),
      source: "manual",
    });
    await invoice.save();
    return res.status(201).json({ message: "Factura creada.", invoice: sanitizeDoc(invoice) });
  } catch (error) {
    if (error?.name === "ValidationError") {
      const messages = Object.values(error.errors || {}).map((e) => e.message);
      return sendError(res, 400, "VALIDATION_ERROR", "Error de validación", messages);
    }
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al crear la factura.");
  }
});

router.get("/:id/pdf", validateObjectIdParam("id"), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return sendError(res, 404, "INVOICE_NOT_FOUND", "Factura no encontrada.");
    }
    const client = await AgencyClient.findById(invoice.client);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="comprobante-${String(invoice.folio).padStart(6, "0")}.pdf"`
    );
    generateInvoicePdf(invoice, client, res);
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al generar el PDF de la factura.");
  }
});

module.exports = router;
