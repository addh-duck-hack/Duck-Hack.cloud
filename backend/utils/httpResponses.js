const sendError = (res, status, code, message, details) => {
  const payload = {
    ok: false,
    error: {
      status,
      code,
      message,
    },
  };

  if (details !== undefined) {
    payload.error.details = details;
  }

  return res.status(status).json(payload);
};

module.exports = {
  sendError,
};
