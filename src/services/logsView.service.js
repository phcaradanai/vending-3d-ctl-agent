import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, "../../logs");

/** Categories aligned with `logAgent` + Morgan `access.log`. */
export const LOG_VIEW_CATEGORIES = [
  "http",
  "serial",
  "queue",
  "sy600",
  "mqtt",
  "app",
  "error",
  "access",
];

/**
 * @param {string} logsDir
 * @param {string} basename
 * @returns {string}
 */
export function resolveSafeLogPath(logsDir, basename) {
  const base = path.resolve(logsDir);
  const target = path.resolve(base, basename);
  const normBase = base.endsWith(path.sep) ? base : base + path.sep;
  if (target !== base && !target.startsWith(normBase)) {
    throw new Error("Invalid log path");
  }
  return target;
}

/**
 * @param {string} category
 * @param {string} basename
 * @returns {boolean}
 */
export function isAllowedBasename(category, basename) {
  if (!LOG_VIEW_CATEGORIES.includes(category)) return false;
  if (category === "access") {
    if (basename === "access.log") return true;
    return /^\d{8}-\d{4}-\d+-access\.log(\.gz)?$/.test(basename);
  }
  const esc = category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^events-${esc}\\.log$`).test(basename)) return true;
  return new RegExp(`^events-${esc}-\\d{8}-p\\d+\\.log(\\.gz)?$`).test(basename);
}

/**
 * @param {string} category
 * @returns {{ name: string, size: number, mtimeMs: number, compressed: boolean }[]}
 */
export function listLogFilesForCategory(category, logsDir = LOGS_DIR) {
  if (!LOG_VIEW_CATEGORIES.includes(category)) {
    throw new Error("Unknown log category");
  }
  if (!fs.existsSync(logsDir)) return [];
  const names = fs.readdirSync(logsDir);
  const out = [];
  for (const name of names) {
    if (!isAllowedBasename(category, name)) continue;
    try {
      const full = resolveSafeLogPath(logsDir, name);
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      out.push({
        name,
        size: st.size,
        mtimeMs: st.mtimeMs,
        compressed: name.endsWith(".gz"),
      });
    } catch {
      continue;
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

/**
 * @param {string} category
 * @returns {string}
 */
export function defaultBasenameForCategory(category) {
  if (category === "access") return "access.log";
  return `events-${category}.log`;
}

/**
 * Read last `lineCount` lines from a text blob (split on \\r?\\n).
 * @param {string} text
 * @param {number} lineCount
 * @param {boolean} partialFirstLine
 * @returns {string[]}
 */
function tailLinesFromText(text, lineCount, partialFirstLine) {
  const parts = text.split(/\r?\n/);
  if (partialFirstLine && parts.length && parts[0] !== "") {
    parts[0] = `[partial] ${parts[0]}`;
  }
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  if (parts.length <= lineCount) return parts;
  return parts.slice(-lineCount);
}

/**
 * @param {string} fullPath
 * @param {number} lineCount
 * @param {number} maxTailBytes
 * @returns {{ lines: string[], totalBytes: number, readFromByte: number, partialFirstLine: boolean }}
 */
export function readPlainLogTail(fullPath, lineCount, maxTailBytes) {
  const st = fs.statSync(fullPath);
  const totalBytes = st.size;
  if (totalBytes === 0) {
    return { lines: [], totalBytes: 0, readFromByte: 0, partialFirstLine: false };
  }
  const readSize = Math.min(totalBytes, maxTailBytes);
  const readFromByte = totalBytes - readSize;
  const fd = fs.openSync(fullPath, "r");
  try {
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, readFromByte);
    const text = buf.toString("utf8");
    const partialFirstLine = readFromByte > 0;
    const lines = tailLinesFromText(text, lineCount, partialFirstLine);
    return { lines, totalBytes, readFromByte, partialFirstLine };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Full read + gunzip + tail (only for smaller archives).
 * @param {string} fullPath
 * @param {number} lineCount
 * @param {number} maxCompressedBytes
 */
export function readGzipLogTail(fullPath, lineCount, maxCompressedBytes) {
  const st = fs.statSync(fullPath);
  if (st.size > maxCompressedBytes) {
    const err = new Error("Gzip log file too large for API preview");
    err.code = "LOG_GZIP_TOO_LARGE";
    throw err;
  }
  const compressed = fs.readFileSync(fullPath);
  const text = zlib.gunzipSync(compressed).toString("utf8");
  const lines = tailLinesFromText(text, lineCount, false);
  return { lines, totalBytes: st.size, uncompressedApprox: text.length, readFromByte: 0, partialFirstLine: false };
}

export { LOGS_DIR };
