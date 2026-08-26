const express = require("express");
const router = express.Router();
const AgencyClient = require("../models/agencyClient.model");
const HostingPayment = require("../models/hostingPayment.model");
const DesignDebt = require("../models/designDebt.model");
const { verifyToken, authorizeRoles, ROLES } = require("../middleware/authMiddleware");
const {
  validateObjectIdParam,
  validateAgencyClientPayload,
  validateHostingPaymentPayload,
  validateDesignDebtPayload,
} = require("../middleware/validationMiddleware");
const { sendError } = require("../utils/httpResponses");

// Módulo confidencial: información de facturación/hosting de clientes de agencia.
// Acceso exclusivo a super_admin (a diferencia de storeConfig.routes.js, aquí NO
// se incluye store_admin). Ver nota operativa en el plan: solo usar/poblar desde
// la instancia interna de Duck-Hack.
router.use(verifyToken, authorizeRoles(ROLES.SUPER_ADMIN));

const sanitizeDoc = (doc) => {
  if (!doc) return null;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete obj.__v;
  return obj;
};

const recalculateDebtStatus = (amount, amountPaid) => {
  if (amountPaid <= 0) return "pending";
  if (amountPaid >= amount) return "paid";
  return "partial";
};

const ensureAgencyClientExists = async (req, res, next) => {
  try {
    const clientId = req.params.id || req.params.clientId;
    const client = await AgencyClient.findById(clientId);
    if (!client) {
      return sendError(res, 404, "AGENCY_CLIENT_NOT_FOUND", "Cliente de agencia no encontrado.");
    }
    req.agencyClient = client;
    return next();
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al consultar el cliente de agencia.");
  }
};

const handleMongooseError = (res, error, fallbackMessage) => {
  if (error?.name === "ValidationError") {
    const messages = Object.values(error.errors || {}).map((e) => e.message);
    return sendError(res, 400, "VALIDATION_ERROR", "Error de validación", messages);
  }
  if (error?.code === 11000) {
    return sendError(res, 409, "DUPLICATE_KEY", "Conflicto de unicidad.");
  }
  return sendError(res, 500, "INTERNAL_SERVER_ERROR", fallbackMessage);
};

// ---------------------------------------------------------------------------
// AgencyClient
// ---------------------------------------------------------------------------

// Listado con estado calculado (último pago de hosting vigente + deuda de diseño
// pendiente), resuelto en un solo round-trip vía agregación para poder pintar
// los badges de color de la lista sin N+1 fetches en el frontend.
router.get("/", async (req, res) => {
  try {
    const clients = await AgencyClient.aggregate([
      { $sort: { businessName: 1 } },
      {
        $lookup: {
          from: HostingPayment.collection.name,
          let: { clientId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$client", "$$clientId"] } } },
            { $sort: { coversUntil: -1 } },
            { $limit: 1 },
          ],
          as: "lastHostingPayment",
        },
      },
      {
        $lookup: {
          from: DesignDebt.collection.name,
          let: { clientId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$client", "$$clientId"] } } },
            { $match: { status: { $ne: "paid" } } },
            {
              $group: {
                _id: null,
                pendingTotal: { $sum: { $subtract: ["$amount", "$amountPaid"] } },
                count: { $sum: 1 },
              },
            },
          ],
          as: "debtSummary",
        },
      },
      {
        $addFields: {
          hostingPaidUntil: { $arrayElemAt: ["$lastHostingPayment.coversUntil", 0] },
          pendingDebtTotal: { $ifNull: [{ $arrayElemAt: ["$debtSummary.pendingTotal", 0] }, 0] },
          pendingDebtCount: { $ifNull: [{ $arrayElemAt: ["$debtSummary.count", 0] }, 0] },
        },
      },
      { $project: { lastHostingPayment: 0, debtSummary: 0, __v: 0 } },
    ]);

    return res.status(200).json({ items: clients });
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar clientes de agencia.");
  }
});

router.post("/", validateAgencyClientPayload, async (req, res) => {
  try {
    const client = new AgencyClient(req.body);
    await client.save();
    return res.status(201).json({ message: "Cliente de agencia creado.", client: sanitizeDoc(client) });
  } catch (error) {
    return handleMongooseError(res, error, "Error al crear el cliente de agencia.");
  }
});

router.get("/:id", validateObjectIdParam("id"), ensureAgencyClientExists, async (req, res) => {
  return res.status(200).json(sanitizeDoc(req.agencyClient));
});

router.put(
  "/:id",
  validateObjectIdParam("id"),
  ensureAgencyClientExists,
  validateAgencyClientPayload,
  async (req, res) => {
    try {
      const allowedFields = [
        "businessName",
        "contactName",
        "contactEmail",
        "contactPhone",
        "siteUrl",
        "hostingProvider",
        "serverLocation",
        "notes",
        "isActive",
      ];

      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          req.agencyClient[key] = req.body[key];
        }
      }

      await req.agencyClient.save();
      return res.status(200).json({ message: "Cliente de agencia actualizado.", client: sanitizeDoc(req.agencyClient) });
    } catch (error) {
      return handleMongooseError(res, error, "Error al actualizar el cliente de agencia.");
    }
  }
);

router.delete("/:id", validateObjectIdParam("id"), ensureAgencyClientExists, async (req, res) => {
  try {
    const clientId = req.agencyClient._id;
    const [hasPayments, hasDebts] = await Promise.all([
      HostingPayment.exists({ client: clientId }),
      DesignDebt.exists({ client: clientId }),
    ]);

    if (hasPayments || hasDebts) {
      return sendError(
        res,
        409,
        "AGENCY_CLIENT_HAS_RELATED_RECORDS",
        "No se puede eliminar el cliente: tiene pagos de hosting o deudas de diseño registrados."
      );
    }

    await req.agencyClient.deleteOne();
    return res.status(200).json({ message: "Cliente de agencia eliminado." });
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el cliente de agencia.");
  }
});

// ---------------------------------------------------------------------------
// Hosting payments (historial de pagos de hosting de un cliente)
// ---------------------------------------------------------------------------

router.get(
  "/:id/hosting-payments",
  validateObjectIdParam("id"),
  ensureAgencyClientExists,
  async (req, res) => {
    try {
      const payments = await HostingPayment.find({ client: req.agencyClient._id }).sort({ coversUntil: -1 });
      return res.status(200).json({ items: payments.map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar pagos de hosting.");
    }
  }
);

router.post(
  "/:id/hosting-payments",
  validateObjectIdParam("id"),
  ensureAgencyClientExists,
  validateHostingPaymentPayload,
  async (req, res) => {
    try {
      const payment = new HostingPayment({
        client: req.agencyClient._id,
        paidAt: req.body.paidAt,
        coversUntil: req.body.coversUntil,
        amount: req.body.amount,
        notes: req.body.notes,
      });
      await payment.save();
      return res.status(201).json({ message: "Pago de hosting registrado.", payment: sanitizeDoc(payment) });
    } catch (error) {
      return handleMongooseError(res, error, "Error al registrar el pago de hosting.");
    }
  }
);

router.put(
  "/:id/hosting-payments/:paymentId",
  validateObjectIdParam("id"),
  validateObjectIdParam("paymentId"),
  ensureAgencyClientExists,
  validateHostingPaymentPayload,
  async (req, res) => {
    try {
      const payment = await HostingPayment.findOne({
        _id: req.params.paymentId,
        client: req.agencyClient._id,
      });
      if (!payment) {
        return sendError(res, 404, "HOSTING_PAYMENT_NOT_FOUND", "Pago de hosting no encontrado.");
      }

      payment.paidAt = req.body.paidAt;
      payment.coversUntil = req.body.coversUntil;
      if (req.body.amount !== undefined) payment.amount = req.body.amount;
      if (req.body.notes !== undefined) payment.notes = req.body.notes;

      await payment.save();
      return res.status(200).json({ message: "Pago de hosting actualizado.", payment: sanitizeDoc(payment) });
    } catch (error) {
      return handleMongooseError(res, error, "Error al actualizar el pago de hosting.");
    }
  }
);

router.delete(
  "/:id/hosting-payments/:paymentId",
  validateObjectIdParam("id"),
  validateObjectIdParam("paymentId"),
  ensureAgencyClientExists,
  async (req, res) => {
    try {
      const deleted = await HostingPayment.findOneAndDelete({
        _id: req.params.paymentId,
        client: req.agencyClient._id,
      });
      if (!deleted) {
        return sendError(res, 404, "HOSTING_PAYMENT_NOT_FOUND", "Pago de hosting no encontrado.");
      }
      return res.status(200).json({ message: "Pago de hosting eliminado." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar el pago de hosting.");
    }
  }
);

// ---------------------------------------------------------------------------
// Design debts (historial de deudas por trabajos de diseño de un cliente)
// ---------------------------------------------------------------------------

router.get(
  "/:id/design-debts",
  validateObjectIdParam("id"),
  ensureAgencyClientExists,
  async (req, res) => {
    try {
      const debts = await DesignDebt.find({ client: req.agencyClient._id }).sort({ invoicedAt: -1 });
      return res.status(200).json({ items: debts.map(sanitizeDoc) });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar deudas de diseño.");
    }
  }
);

router.post(
  "/:id/design-debts",
  validateObjectIdParam("id"),
  ensureAgencyClientExists,
  validateDesignDebtPayload,
  async (req, res) => {
    try {
      const amount = req.body.amount;
      const amountPaid = req.body.amountPaid || 0;
      if (amountPaid > amount) {
        return sendError(res, 400, "VALIDATION_ERROR", "amountPaid no puede superar amount.");
      }

      const debt = new DesignDebt({
        client: req.agencyClient._id,
        description: req.body.description,
        amount,
        amountPaid,
        status: recalculateDebtStatus(amount, amountPaid),
        invoicedAt: req.body.invoicedAt,
        notes: req.body.notes,
      });
      await debt.save();
      return res.status(201).json({ message: "Deuda de diseño registrada.", debt: sanitizeDoc(debt) });
    } catch (error) {
      return handleMongooseError(res, error, "Error al registrar la deuda de diseño.");
    }
  }
);

router.put(
  "/:id/design-debts/:debtId",
  validateObjectIdParam("id"),
  validateObjectIdParam("debtId"),
  ensureAgencyClientExists,
  validateDesignDebtPayload,
  async (req, res) => {
    try {
      const debt = await DesignDebt.findOne({ _id: req.params.debtId, client: req.agencyClient._id });
      if (!debt) {
        return sendError(res, 404, "DESIGN_DEBT_NOT_FOUND", "Deuda de diseño no encontrada.");
      }

      const nextAmount = req.body.amount !== undefined ? req.body.amount : debt.amount;
      const nextAmountPaid = req.body.amountPaid !== undefined ? req.body.amountPaid : debt.amountPaid;

      if (nextAmountPaid > nextAmount) {
        return sendError(res, 400, "VALIDATION_ERROR", "amountPaid no puede superar amount.");
      }

      if (req.body.description !== undefined) debt.description = req.body.description;
      if (req.body.notes !== undefined) debt.notes = req.body.notes;
      if (req.body.invoicedAt !== undefined) debt.invoicedAt = req.body.invoicedAt;
      debt.amount = nextAmount;
      debt.amountPaid = nextAmountPaid;
      debt.status = recalculateDebtStatus(nextAmount, nextAmountPaid);

      await debt.save();
      return res.status(200).json({ message: "Deuda de diseño actualizada.", debt: sanitizeDoc(debt) });
    } catch (error) {
      return handleMongooseError(res, error, "Error al actualizar la deuda de diseño.");
    }
  }
);

router.delete(
  "/:id/design-debts/:debtId",
  validateObjectIdParam("id"),
  validateObjectIdParam("debtId"),
  ensureAgencyClientExists,
  async (req, res) => {
    try {
      const deleted = await DesignDebt.findOneAndDelete({ _id: req.params.debtId, client: req.agencyClient._id });
      if (!deleted) {
        return sendError(res, 404, "DESIGN_DEBT_NOT_FOUND", "Deuda de diseño no encontrada.");
      }
      return res.status(200).json({ message: "Deuda de diseño eliminada." });
    } catch (error) {
      return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar la deuda de diseño.");
    }
  }
);

module.exports = router;
