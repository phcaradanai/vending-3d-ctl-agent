import crypto from "node:crypto";
import { API_BEARER_REQUIRED, API_BEARER_TOKEN } from "../config/env.js";

function bearerTokensEqual(expected, sent) {
  const a = Buffer.from(String(expected), "utf8");
  const b = Buffer.from(String(sent), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * When `API_BEARER_TOKEN` is non-empty, protected `/api/v1/*` requests must send
 * `Authorization: Bearer <API_BEARER_TOKEN>`.
 * Mount this after public routes (e.g. `GET /health`). OPTIONS (CORS preflight) is skipped.
 */
export function requireApiBearerToken(req, res, next) {
  if (!API_BEARER_TOKEN) {
    if (API_BEARER_REQUIRED) {
      return res.status(503).json({
        error: "ServiceUnavailable",
        details: "Bearer auth is required but API_BEARER_TOKEN is not configured",
      });
    }
    return next();
  }
  if (req.method === "OPTIONS") {
    return next();
  }
  const raw = req.get("authorization") || "";
  const m = /^Bearer\s+(\S+)$/i.exec(raw.trim());
  if (!m) {
    return res.status(401).json({
      error: "Unauthorized",
      details: "Missing or invalid Authorization header (expected: Bearer <token>)",
    });
  }
  if (!bearerTokensEqual(API_BEARER_TOKEN, m[1])) {
    return res.status(401).json({
      error: "Unauthorized",
      details: "Invalid Bearer token",
    });
  }
  return next();
}
