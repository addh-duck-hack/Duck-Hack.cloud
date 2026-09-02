const express = require("express");
const router = express.Router();
const Invoice = require("../models/invoice.model");
const Transaction = require("../models/transaction.model");
const AgencyClient = require("../models/agencyClient.model");
const {
  validateObjectIdParam,
  validateInvoiceFromTransactionsPayload,
  validateInvoiceUpdatePayload,
} = require("../middleware/validationMiddleware");
const { sendError } = require("../utils/httpResponses");
// Auth vive en @duck-hack/core-api (packages/core-api/modules/auth.js) —
// verifyToken/authorizeRoles se arman con sendError, ROLES es estático.
const { auth } = require("@duck-hack/core-api");
const { verifyToken, authorizeRoles } = auth.createAuthMiddleware(sendError);
const { ROLES } = auth;
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

// Mismo criterio de "mes calendario" que GET /api/accounting/summary (UTC,
// no la zona horaria del servidor) — evita que un movimiento del 1º del mes
// a medianoche local cuente como del mes anterior según dónde corra el proceso.
const monthKeyUTC = (date) => `${date.getUTCFullYear()}-${date.getUTCMonth()}`;

const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });

const buildDefaultConcept = (transactions) => {
  const categories = [...new Set(transactions.map((t) => t.category).filter(Boolean))];
  const monthLabel = MONTH_YEAR_FORMAT.format(transactions[0].date);
  const label = categories.length > 0 ? categories.join(", ") : "Movimientos";
  return `${label} - ${monthLabel}`;
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

router.post("/", validateInvoiceFromTransactionsPayload, async (req, res) => {
  try {
    const client = await AgencyClient.findById(req.body.client);
    if (!client) {
      return sendError(res, 404, "AGENCY_CLIENT_NOT_FOUND", "Cliente de agencia no encontrado.");
    }

    const transactions = await Transaction.find({ _id: { $in: req.body.transactionIds } });
    if (transactions.length !== req.body.transactionIds.length) {
      return sendError(res, 404, "TRANSACTION_NOT_FOUND", "Uno o más movimientos no existen.");
    }

    const invalid = transactions.find(
      (t) => t.type !== "income" || String(t.client) !== String(client._id) || t.invoice
    );
    if (invalid) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        "Todos los movimientos deben ser ingresos del cliente seleccionado y no estar ya facturados."
      );
    }

    const firstMonthKey = monthKeyUTC(transactions[0].date);
    if (transactions.some((t) => monthKeyUTC(t.date) !== firstMonthKey)) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        "Todos los movimientos seleccionados deben ser del mismo mes."
      );
    }

    const amount = transactions.reduce((sum, t) => sum + t.amount, 0);
    const concept = buildDefaultConcept(transactions);
    // Un renglón por movimiento en el PDF (ver invoicePdf.js), no un total
    // aplastado. El concepto de cada renglón es el que mandó el usuario en
    // itemConcepts[i] (paralelo a transactionIds), y si lo dejó vacío se cae
    // al description/category del movimiento.
    const conceptByTransactionId = new Map(
      (req.body.itemConcepts || []).map((concept, index) => [String(req.body.transactionIds[index]), concept])
    );
    const items = transactions.map((t) => ({
      concept:
        conceptByTransactionId.get(String(t._id)) ||
        t.description ||
        t.category ||
        "Movimiento",
      amount: t.amount,
    }));

    const folio = await getNextInvoiceFolio();
    const invoice = new Invoice({
      client: client._id,
      folio,
      concept,
      amount,
      items,
      issuedAt: new Date(),
      source: "movements",
      transactions: transactions.map((t) => t._id),
    });
    await invoice.save();

    await Transaction.updateMany(
      { _id: { $in: transactions.map((t) => t._id) } },
      { $set: { invoice: invoice._id } }
    );

    return res.status(201).json({ message: "Factura creada.", invoice: sanitizeDoc(invoice) });
  } catch (error) {
    if (error?.name === "ValidationError") {
      const messages = Object.values(error.errors || {}).map((e) => e.message);
      return sendError(res, 400, "VALIDATION_ERROR", "Error de validación", messages);
    }
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al crear la factura.");
  }
});

router.get("/:id", validateObjectIdParam("id"), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate("client", "businessName");
    if (!invoice) {
      return sendError(res, 404, "INVOICE_NOT_FOUND", "Factura no encontrada.");
    }
    return res.status(200).json({ invoice: sanitizeDoc(invoice) });
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar la factura.");
  }
});

// Edición acotada: conceptos por movimiento y/o fecha de emisión. El monto, el
// cliente, el folio y los movimientos cubiertos no se tocan acá — para eso se
// cancela y se re-emite. `items` es posicional: items[i].concept reemplaza el
// concepto del renglón i (mismo orden que invoice.items / invoice.transactions).
router.put("/:id", validateObjectIdParam("id"), validateInvoiceUpdatePayload, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return sendError(res, 404, "INVOICE_NOT_FOUND", "Factura no encontrada.");
    }

    if (req.body.itemConcepts) {
      if (req.body.itemConcepts.length !== invoice.items.length) {
        return sendError(
          res,
          400,
          "VALIDATION_ERROR",
          `items debe tener exactamente ${invoice.items.length} elemento(s), uno por renglón de la factura.`
        );
      }
      req.body.itemConcepts.forEach((concept, index) => {
        invoice.items[index].concept = concept;
      });
      invoice.markModified("items");
    }

    if (req.body.issuedAt) {
      invoice.issuedAt = req.body.issuedAt;
    }

    await invoice.save();
    await invoice.populate("client", "businessName");
    return res.status(200).json({ message: "Factura actualizada.", invoice: sanitizeDoc(invoice) });
  } catch (error) {
    if (error?.name === "ValidationError") {
      const messages = Object.values(error.errors || {}).map((e) => e.message);
      return sendError(res, 400, "VALIDATION_ERROR", "Error de validación", messages);
    }
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al actualizar la factura.");
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
