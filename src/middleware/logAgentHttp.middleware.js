import { randomUUID } from "node:crypto";
import { logAgent } from "../logger/logAgent.js";

/**
 * Assign `X-Request-Id` / `req.requestId`, then on `res.finish` append one JSON line to `events-http.log`.
 */
export function logAgentHttpMiddleware(req, res, next) {
  const incoming = req.headers["x-request-id"];
  req.requestId =
    typeof incoming === "string" && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
  res.setHeader("X-Request-Id", req.requestId);

  const started = Date.now();
  res.on("finish", () => {
    logAgent.http({
      event: "http.response",
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - started,
      contentLength: res.getHeader("content-length") ?? null,
    });
  });

  next();
}
