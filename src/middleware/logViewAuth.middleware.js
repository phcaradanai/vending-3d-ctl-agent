import { APP_LOG_VIEW_API_ENABLED } from "../config/env.js";

/**
 * When `APP_LOG_VIEW_API_ENABLED` is false, respond 404 (hide route).
 * Bearer auth for `/api/v1` is handled by `requireApiBearerToken` (`API_BEARER_TOKEN`).
 */
export function requireLogViewAccess(req, res, next) {
  if (!APP_LOG_VIEW_API_ENABLED) {
    return res.status(404).json({ error: "Not found" });
  }
  return next();
}
