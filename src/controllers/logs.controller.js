import fs from "node:fs";
import path from "node:path";
import {
  APP_LOG_VIEW_MAX_LINES,
  APP_LOG_VIEW_TAIL_BYTES,
  APP_LOG_VIEW_GZIP_MAX_BYTES,
} from "../config/env.js";
import {
  LOG_VIEW_CATEGORIES,
  LOGS_DIR,
  defaultBasenameForCategory,
  isAllowedBasename,
  listLogFilesForCategory,
  readGzipLogTail,
  readPlainLogTail,
  resolveSafeLogPath,
} from "../services/logsView.service.js";

function clampLines(raw) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return 200;
  return Math.min(n, APP_LOG_VIEW_MAX_LINES);
}

/** GET /logs */
export function listLogsController(_req, res) {
  const categories = LOG_VIEW_CATEGORIES.map((id) => {
    const files = listLogFilesForCategory(id);
    const active = defaultBasenameForCategory(id);
    const activeEntry = files.find((f) => f.name === active);
    return {
      id,
      activeFile: active,
      activeSizeBytes: activeEntry?.size ?? null,
      activeMtimeMs: activeEntry?.mtimeMs ?? null,
      files,
    };
  });
  return res.json({
    dir: "logs",
    categories,
  });
}

/** GET /logs/:category */
export function getLogCategoryController(req, res) {
  const { category } = req.params;
  if (!LOG_VIEW_CATEGORIES.includes(category)) {
    return res.status(404).json({ error: "Unknown category", details: category });
  }
  const lines = clampLines(req.query.lines);
  let basename =
    typeof req.query.file === "string" && req.query.file.trim()
      ? path.basename(req.query.file.trim())
      : defaultBasenameForCategory(category);

  if (!isAllowedBasename(category, basename)) {
    return res.status(400).json({ error: "Invalid file name", details: basename });
  }

  let fullPath;
  try {
    fullPath = resolveSafeLogPath(LOGS_DIR, basename);
  } catch {
    return res.status(400).json({ error: "Invalid file path" });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: "Log file not found", details: basename });
  }

  try {
    if (basename.endsWith(".gz")) {
      const r = readGzipLogTail(fullPath, lines, APP_LOG_VIEW_GZIP_MAX_BYTES);
      return res.json({
        category,
        file: basename,
        linesRequested: lines,
        lineCount: r.lines.length,
        totalFileBytes: r.totalBytes,
        uncompressedApproxBytes: r.uncompressedApprox,
        truncatedFromStartBytes: null,
        partialFirstLine: r.partialFirstLine,
        lines: r.lines,
      });
    }
    const r = readPlainLogTail(fullPath, lines, APP_LOG_VIEW_TAIL_BYTES);
    return res.json({
      category,
      file: basename,
      linesRequested: lines,
      lineCount: r.lines.length,
      totalFileBytes: r.totalBytes,
      truncatedFromStartBytes: r.readFromByte > 0 ? r.readFromByte : null,
      partialFirstLine: r.partialFirstLine,
      lines: r.lines,
    });
  } catch (err) {
    if (err.code === "LOG_GZIP_TOO_LARGE") {
      return res.status(413).json({
        error: "Log file too large",
        details: err.message,
      });
    }
    throw err;
  }
}
