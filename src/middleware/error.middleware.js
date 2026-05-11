export async function notFoundHandler(_req, res) {
  return res.status(404).json({
    error: "Route not found",
  });
}

export function errorHandler(error, _req, res, _next) {
  const statusCode = Number(error.status) || 500;

  return res.status(statusCode).json({
    error: "Failed to write serial data",
    details: error.message,
  });
}
