export async function notFoundHandler(_req, res) {
  return res.status(404).json({
    error: "Route not found",
  });
}

import { logAgent } from "../logger/logAgent.js";

export function errorHandler(error, req, res, _next) {
  const statusCode = Number(error.status) || 500;

  logAgent.error({
    event: "http.error",
    requestId: req?.requestId ?? null,
    method: req?.method,
    path: req?.originalUrl || req?.url,
    statusCode,
    message: error.message,
    stack: error.stack,
  });

  return res.status(statusCode).json({
    error: "Failed to write serial data",
    details: error.message,
  });
}
