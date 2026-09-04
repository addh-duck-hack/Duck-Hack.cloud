const express = require("express");
const router = express.Router();
const Transaction = require("../models/transaction.model");
const {
  validateObjectIdParam,
  validateTransactionPayload,
  validateOpeningBalancePayload,
} = require("../middleware/validationMiddleware");
const { sendError } = require("../utils/httpResponses");
// Auth vive en @duck-hack/core-api (packages/core-api/modules/auth.js) —
// verifyToken/authorizeRoles se arman con sendError, ROLES es estático.
const { auth } = require("@duck-hack/core-api");
const { verifyToken, authorizeRoles } = auth.createAuthMiddleware(sendError);
const { ROLES } = auth;

// Confidencial: mismo criterio que /api/agency-clients — super_admin + store_admin.
router.use(verifyToken, authorizeRoles(ROLES.SUPER_ADMIN, ROLES.STORE_ADMIN));

const sanitizeDoc = (doc) => {
  if (!doc) return null;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete obj.__v;
  return obj;
};

const handleMongooseError = (res, error, fallbackMessage) => {
  if (error?.name === "ValidationError") {
    const messages = Object.values(error.errors || {}).map((e) => e.message);
    return sendError(res, 400, "VALIDATION_ERROR", "Error de validación", messages);
  }
  return sendError(res, 500, "INTERNAL_SERVER_ERROR", fallbackMessage);
};

// ---------------------------------------------------------------------------
// Transacciones
// ---------------------------------------------------------------------------

router.get("/transactions", async (req, res) => {
  try {
    const filter = {};
    if (req.query.type === "income" || req.query.type === "expense") {
      filter.type = req.query.type;
    }
    if (req.query.client) {
      filter.client = req.query.client;
    }
    if (req.query.invoiced === "true") {
      filter.invoice = { $ne: null };
    } else if (req.query.invoiced === "false") {
      filter.invoice = null;
    }
    if (req.query.startDate || req.query.endDate) {
      filter.date = {};
      if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.date.$lte = new Date(req.query.endDate);
    }

    const transactions = await Transaction.find(filter)
      .sort({ date: -1 })
      .limit(500)
      .populate("client", "businessName");

    return res.status(200).json({ items: transactions.map(sanitizeDoc) });
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al listar transacciones.");
  }
});

router.post("/transactions", validateTransactionPayload, async (req, res) => {
  try {
    const transaction = new Transaction(req.body);
    await transaction.save();
    return res.status(201).json({ message: "Transacción registrada.", transaction: sanitizeDoc(transaction) });
  } catch (error) {
    return handleMongooseError(res, error, "Error al registrar la transacción.");
  }
});

router.put(
  "/transactions/:id",
  validateObjectIdParam("id"),
  validateTransactionPayload,
  async (req, res) => {
    try {
      const transaction = await Transaction.findById(req.params.id);
      if (!transaction) {
        return sendError(res, 404, "TRANSACTION_NOT_FOUND", "Transacción no encontrada.");
      }
      if (transaction.source !== "manual") {
        return sendError(
          res,
          409,
          "TRANSACTION_NOT_EDITABLE",
          "Esta transacción se generó automáticamente; corrígela desde su origen (pago de hosting o deuda)."
        );
      }

      const editableFields = ["type", "amount", "date", "category", "description", "client"];
      for (const key of editableFields) {
        if (req.body[key] !== undefined) {
          transaction[key] = req.body[key];
        }
      }

      await transaction.save();
      return res.status(200).json({ message: "Transacción actualizada.", transaction: sanitizeDoc(transaction) });
    } catch (error) {
      return handleMongooseError(res, error, "Error al actualizar la transacción.");
    }
  }
);

router.delete("/transactions/:id", validateObjectIdParam("id"), async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      return sendError(res, 404, "TRANSACTION_NOT_FOUND", "Transacción no encontrada.");
    }
    if (transaction.source !== "manual") {
      return sendError(
        res,
        409,
        "TRANSACTION_NOT_EDITABLE",
        "Esta transacción se generó automáticamente; no se puede eliminar directamente."
      );
    }
    await transaction.deleteOne();
    return res.status(200).json({ message: "Transacción eliminada." });
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al eliminar la transacción.");
  }
});

// ---------------------------------------------------------------------------
// Saldo inicial
// ---------------------------------------------------------------------------

// Idempotente: si ya existe una transacción de saldo inicial, la actualiza en
// vez de crear una segunda (el saldo inicial es único por diseño).
router.post("/opening-balance", validateOpeningBalancePayload, async (req, res) => {
  try {
    const existing = await Transaction.findOne({ source: "opening_balance" });
    if (existing) {
      existing.amount = req.body.amount;
      if (req.body.date) existing.date = req.body.date;
      await existing.save();
      return res.status(200).json({ message: "Saldo inicial actualizado.", transaction: sanitizeDoc(existing) });
    }

    const transaction = new Transaction({
      type: "income",
      amount: req.body.amount,
      date: req.body.date || new Date(),
      category: "Saldo inicial",
      description: "Saldo inicial de la cuenta",
      source: "opening_balance",
    });
    await transaction.save();
    return res.status(201).json({ message: "Saldo inicial configurado.", transaction: sanitizeDoc(transaction) });
  } catch (error) {
    return handleMongooseError(res, error, "Error al configurar el saldo inicial.");
  }
});

// ---------------------------------------------------------------------------
// Resumen / dashboard
// ---------------------------------------------------------------------------

router.get("/summary", async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1));

    const [monthlyRaw, balanceRaw, balanceBeforeYearRaw] = await Promise.all([
      Transaction.aggregate([
        { $match: { date: { $gte: startOfYear, $lt: startOfNextYear } } },
        { $group: { _id: { month: { $month: "$date" }, type: "$type" }, total: { $sum: "$amount" } } },
      ]),
      Transaction.aggregate([
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ]),
      // Saldo arrastrado de años anteriores: para poder mostrar "cómo cerró
      // la cuenta" mes a mes dentro del año consultado, no solo el neto de
      // ese mes, hace falta el punto de partida (todo lo anterior al 1 de
      // enero de `year`), sin importar si `year` es el año en curso o uno pasado.
      Transaction.aggregate([
        { $match: { date: { $lt: startOfYear } } },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ]),
    ]);

    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, income: 0, expense: 0 }));
    for (const row of monthlyRaw) {
      const monthEntry = months[row._id.month - 1];
      if (!monthEntry) continue;
      if (row._id.type === "income") monthEntry.income = row.total;
      if (row._id.type === "expense") monthEntry.expense = row.total;
    }

    const totalsByType = { income: 0, expense: 0 };
    for (const row of balanceRaw) {
      if (row._id === "income" || row._id === "expense") totalsByType[row._id] = row.total;
    }
    const currentBalance = totalsByType.income - totalsByType.expense;

    const totalsBeforeYear = { income: 0, expense: 0 };
    for (const row of balanceBeforeYearRaw) {
      if (row._id === "income" || row._id === "expense") totalsBeforeYear[row._id] = row.total;
    }

    // Saldo con el que cerró la cuenta al final de cada mes (arrastrado desde
    // antes del año, no solo el neto del mes) — para que "cómo cerró la cuenta"
    // se vea junto al neto, en vez de tener que sumarlo a mano mes a mes.
    let runningBalance = totalsBeforeYear.income - totalsBeforeYear.expense;
    for (const monthEntry of months) {
      runningBalance += monthEntry.income - monthEntry.expense;
      monthEntry.closingBalance = runningBalance;
    }

    return res.status(200).json({ year, currentBalance, months });
  } catch (error) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Error al calcular el resumen de contabilidad.");
  }
});

module.exports = router;
