/**
 * Wraps `res.json` for `/api/v1` so successful plain-object bodies get `ok: 1`
 * and error responses (status ≥ 400) get `ok: 0`, without removing existing fields.
 * Skips when `body` already has `ok`, or when body is not a plain object (e.g. array, Buffer).
 */
export function apiOkEnvelopeMiddleware(_req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = function jsonWithOkEnvelope(body) {
    if (body === null || body === undefined) {
      return originalJson(body);
    }
    if (typeof body !== "object" || Buffer.isBuffer(body) || Array.isArray(body)) {
      return originalJson(body);
    }
    if ("ok" in body) {
      return originalJson(body);
    }
    const status = Number(res.statusCode) || 200;
    const ok = status >= 400 ? 0 : 1;
    return originalJson({ ok, ...body });
  };
  next();
}
