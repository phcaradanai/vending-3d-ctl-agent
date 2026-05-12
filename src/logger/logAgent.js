import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStream } from "rotating-file-stream";
import {
  APP_LOG_AGENT_ENABLED,
  APP_LOG_CHUNK_SIZE,
  APP_LOG_COMPRESS_ROTATED,
  APP_LOG_MAX_ROTATED_FILES,
  APP_LOG_ROTATED_MAX_TOTAL,
  APP_TIMEZONE,
} from "../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "../../logs");

/**
 * Wall-clock time in `APP_TIMEZONE` as ISO-like string with numeric offset (not UTC `Z`).
 * Matches operators comparing with morgan lines that use `+0700`.
 */
function formatLogTimestamp(date = new Date()) {
  const timeZone = APP_TIMEZONE || "Asia/Bangkok";
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  const yyyy = get("year");
  const mo = get("month");
  const da = get("day");
  const hh = get("hour");
  const mi = get("minute");
  const se = get("second");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  const offsetFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "longOffset",
  });
  const tzPart =
    offsetFmt.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "GMT+7";
  const offsetIso = normalizeLongOffsetToIso(tzPart);
  return `${yyyy}-${mo}-${da}T${hh}:${mi}:${se}.${ms}${offsetIso}`;
}

function normalizeLongOffsetToIso(longOffsetLabel) {
  const s = String(longOffsetLabel || "").replace(/\s/g, "");
  const m = s.match(/([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return "+07:00";
  const sign = m[1];
  const hours = String(Number(m[2])).padStart(2, "0");
  const mins = m[3] ? String(Number(m[3])).padStart(2, "0") : "00";
  return `${sign}${hours}:${mins}`;
}

/** YYYYMMDD in `APP_TIMEZONE` for rotated chunk names. */
function formatYmdCompactInAppTz(date) {
  const timeZone = APP_TIMEZONE || "Asia/Bangkok";
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(date).replace(/-/g, "");
}

/** Required when both `interval` and `size` are set (see `rotating-file-stream` README). */
function makeEventLogFilenameGenerator(category) {
  return (time, index) => {
    if (!time) {
      return `events-${category}.log`;
    }
    const ymd = formatYmdCompactInAppTz(time);
    const idx = typeof index === "number" && index >= 0 ? index : 0;
    return `events-${category}-${ymd}-p${idx}.log`;
  };
}

function buildLogAgentStreamOptions() {
  const options = {
    interval: "1d",
    size: APP_LOG_CHUNK_SIZE,
    path: LOG_DIR,
  };
  if (APP_LOG_ROTATED_MAX_TOTAL) {
    options.maxSize = APP_LOG_ROTATED_MAX_TOTAL;
  }
  if (APP_LOG_MAX_ROTATED_FILES > 0) {
    options.maxFiles = APP_LOG_MAX_ROTATED_FILES;
  }
  if (APP_LOG_COMPRESS_ROTATED) {
    options.compress = "gzip";
  }
  return options;
}

/** @type {Map<string, ReturnType<typeof createStream>>} */
const streams = new Map();

function getStream(category) {
  if (!APP_LOG_AGENT_ENABLED) return null;
  if (streams.has(category)) return streams.get(category);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const stream = createStream(makeEventLogFilenameGenerator(category), buildLogAgentStreamOptions());
  streams.set(category, stream);
  return stream;
}

function writeLine(category, record) {
  if (!APP_LOG_AGENT_ENABLED) return;
  try {
    const stream = getStream(category);
    if (!stream) return;
    const line =
      JSON.stringify({
        ts: formatLogTimestamp(),
        tz: APP_TIMEZONE,
        ...record,
      }) + "\n";
    stream.write(line);
  } catch (err) {
    console.error(`[logAgent] write failed (${category}): ${err.message}`);
  }
}

/**
 * In-process log agent: one JSON line per event, separate rotating files under `logs/`.
 * Rotation: daily boundary + size chunk (`APP_LOG_CHUNK_SIZE`, default `32M`) so a single file does not grow for 30 days.
 * Caps: `APP_LOG_ROTATED_MAX_TOTAL` (default `1G` per category), `APP_LOG_MAX_ROTATED_FILES` (default `48 * APP_LOG_RETENTION_DAYS`).
 * Optional gzip on rotated chunks: `APP_LOG_COMPRESS_ROTATED=true`. Disable with `APP_LOG_AGENT_ENABLED=false`.
 */
export const logAgent = {
  /** HTTP request/response lifecycle */
  http: (record) => writeLine("http", { kind: "http", ...record }),

  /** Vending / navigation serial writes and RX summaries */
  serial: (record) => writeLine("serial", { kind: "serial", ...record }),

  /** Serial write queue (enqueue / run / done) */
  queue: (record) => writeLine("queue", { kind: "queue", ...record }),

  /** SY600 frames and decoded hints */
  sy600: (record) => writeLine("sy600", { kind: "sy600", ...record }),

  /** MQTT connect / publish / errors (no passwords) */
  mqtt: (record) => writeLine("mqtt", { kind: "mqtt", ...record }),

  /** Bootstrap, config, generic app events */
  app: (record) => writeLine("app", { kind: "app", ...record }),

  /** Uncaught handler errors and high-severity failures */
  error: (record) => writeLine("error", { kind: "error", ...record }),
};
