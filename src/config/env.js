import "dotenv/config";

function toNumber(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const s = String(value).trim();
  if (s === "") return fallback;
  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const s = String(value).trim();
  if (s === "") return fallback;
  return ["1", "true", "yes", "on"].includes(s.toLowerCase());
}

function toNumberArray(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => Number.isFinite(Number(item)))) {
      return parsed.map((item) => Number(item));
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function toHexByteArray(value, fallback) {
  if (!value) return fallback;
  const tokens = String(value)
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return fallback;

  const bytes = tokens.map((token) => {
    const normalized = token.replace(/^0x/i, "");
    if (!/^[\da-fA-F]{1,2}$/.test(normalized)) return NaN;
    return Number.parseInt(normalized, 16);
  });
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    return fallback;
  }
  return bytes;
}

function resolveEnvTemplate(value) {
  return String(value).replace(/\$\{([A-Z0-9_]+)\}/g, (_match, key) => {
    return process.env[key] ?? "";
  });
}

function toRegex(value, fallback) {
  try {
    return new RegExp(value, "i");
  } catch {
    return fallback;
  }
}

export const PORT = toNumber(process.env.PORT, 3000);
export const CUSTOMER_CODE = process.env.CUSTOMER_CODE || "wnyh";
export const VENDING_CODE = process.env.VENDING_CODE || "FFFFFFFF";
export const DOOR_TYPE_STANDBY = toNumberArray(process.env.DOOR_TYPE_STANDBY, [1, 2, 3]);
export const DOOR_TYPE_NOW = toNumberArray(process.env.DOOR_TYPE_NOW, [1, 2, 3]);




// Set process-wide timezone so log rotation uses UTC+7 boundary.
export const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || "Asia/Bangkok";
process.env.TZ = APP_TIMEZONE;
export const SERIAL_VENDING =
  process.env.Serial_VENDING || process.env.SERIAL_VENDING || "/dev/ttyUSB0";
export const SERIAL_VENDING_BAUD_RATE = toNumber(
  process.env.SERIAL_VENDING_BAUD_RATE,
  9600
);
export const SERIAL_NAVIGATION_LIGHTS =
  process.env.Serial_NAVIGATION_LIGHTS ||
  process.env.SERIAL_NAVIGATION_LIGHTS ||
  "/dev/ttyUSB1";
export const SERIAL_NAVIGATION_LIGHTS_BAUD_RATE = toNumber(
  process.env.SERIAL_NAVIGATION_LIGHTS_BAUD_RATE,
  9600
);
export const SERIAL_QR_NFC =
  process.env.Serial_QR_NFC || process.env.SERIAL_QR_NFC || "/dev/ttyUSB2";
export const SERIAL_QR_NFC_BAUD_RATE = toNumber(
  process.env.SERIAL_QR_NFC_BAUD_RATE,
  9600
);
export const SY600_DEVICE_ADDRESS_HEX =
  process.env.SY600_DEVICE_ADDRESS_HEX || "AABBCCDD";
export const SY600_USE_CRC16 = toBoolean(process.env.SY600_USE_CRC16, false);
export const SERIAL_WRITE_TIMEOUT_MS = toNumber(
  process.env.SERIAL_WRITE_TIMEOUT_MS,
  (1 * (50 * 1000))
);
export const SERIAL_API_TIMEOUT_MS = toNumber(
  process.env.SERIAL_API_TIMEOUT_MS,
  (1 * (60 * 1000))
);
export const SERIAL_WRITE_DEBUG = toBoolean(process.env.SERIAL_WRITE_DEBUG, false);
/** Log per-COM serial write queue: enqueue / run / done and waiting labels (default on). */
export const SERIAL_PORT_QUEUE_LOG = toBoolean(process.env.SERIAL_PORT_QUEUE_LOG, true);
export const SERIAL_NAVIGATION_LIGHTS_FRAME_DEBUG = toBoolean(
  process.env.SERIAL_NAVIGATION_LIGHTS_FRAME_DEBUG,
  false
);
export const SERIAL_NAVIGATION_LIGHTS_WRITE_RETRY = toNumber(
  process.env.SERIAL_NAVIGATION_LIGHTS_WRITE_RETRY,
  2
);
export const SERIAL_NAVIGATION_LIGHTS_RETRY_DELAY_MS = toNumber(
  process.env.SERIAL_NAVIGATION_LIGHTS_RETRY_DELAY_MS,
  250
);
export const MQTT_ENABLED = toBoolean(process.env.MQTT_ENABLED, false);
export const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://127.0.0.1:1883";
export const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || "vending-3d-ctl";
export const MQTT_USERNAME = process.env.MQTT_USERNAME || "";
export const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "";
export const MQTT_QRNFC_TOPIC = resolveEnvTemplate(
  process.env.MQTT_QRNFC_TOPIC || "hm/${CUSTOMER_CODE}/${VENDING_CODE}/reader"
);
export const MQTT_QRNFC_QOS = toNumber(process.env.MQTT_QRNFC_QOS, 0);
export const MQTT_QRNFC_RETAIN = toBoolean(process.env.MQTT_QRNFC_RETAIN, false);
export const MQTT_QRNFC_MIFARE_SIGNATURE = toHexByteArray(
  process.env.MQTT_QRNFC_MIFARE_SIGNATURE,
  [0x02, 0xff, 0x01, 0x09, 0x00]
);
export const MQTT_QRNFC_BARCODE_WNY_SIGNATURE_REGEX = toRegex(
  process.env.MQTT_QRNFC_BARCODE_WNY_SIGNATURE_REGEX ||
  "([0-9a-f\\-]{36})_(\\d{8})_(\\d+)_(\\d+)_(IN|OUT)_(\\d{14})",
  /([0-9a-f\-]{36})_(\d{8})_(\d+)_(\d+)_(IN|OUT)_(\d{14})/i
);
export const API_LOG_RETENTION_DAYS = toNumber(
  process.env.API_LOG_RETENTION_DAYS,
  30
);

/**
 * When non-empty, all routes under `/api/v1` require `Authorization: Bearer <this value>`.
 * Leave empty only for local development without auth.
 */
export const API_BEARER_TOKEN = String(process.env.API_BEARER_TOKEN || "").trim();

/** Structured JSON log agent (`logs/events-*.log`). Set false to disable file writes. */
export const APP_LOG_AGENT_ENABLED = toBoolean(process.env.APP_LOG_AGENT_ENABLED, true);
/** Soft retention hint (days); used with chunk estimate for default `APP_LOG_MAX_ROTATED_FILES`. */
export const APP_LOG_RETENTION_DAYS = toNumber(process.env.APP_LOG_RETENTION_DAYS, 30);
/** Rotate active `events-*.log` when it exceeds this size (e.g. `32M`, `10M`). Keeps chunks openable in editors. */
export const APP_LOG_CHUNK_SIZE = String(process.env.APP_LOG_CHUNK_SIZE || "32M").trim() || "32M";
/**
 * Max total size of rotated archives per category (`rotating-file-stream` maxSize). e.g. `1G`, `500M`.
 * Set empty to disable (only `APP_LOG_MAX_ROTATED_FILES` applies when greater than zero).
 */
export const APP_LOG_ROTATED_MAX_TOTAL = String(
  process.env.APP_LOG_ROTATED_MAX_TOTAL !== undefined && process.env.APP_LOG_ROTATED_MAX_TOTAL !== null
    ? process.env.APP_LOG_ROTATED_MAX_TOTAL
    : "1G"
).trim();
/** gzip rotated chunks; active `events-*.log` stays uncompressed. */
export const APP_LOG_COMPRESS_ROTATED = toBoolean(process.env.APP_LOG_COMPRESS_ROTATED, false);
const _maxRotatedFilesRaw = process.env.APP_LOG_MAX_ROTATED_FILES;
/** Max rotated files per category. Default `48 * APP_LOG_RETENTION_DAYS`. Set `0` for no file-count cap. */
export const APP_LOG_MAX_ROTATED_FILES =
  _maxRotatedFilesRaw !== undefined && _maxRotatedFilesRaw !== ""
    ? toNumber(_maxRotatedFilesRaw, 0)
    : 48 * APP_LOG_RETENTION_DAYS;

/** When true, expose `GET /logs` and `GET /logs/:category` (see README). Default off. */
export const APP_LOG_VIEW_API_ENABLED = toBoolean(process.env.APP_LOG_VIEW_API_ENABLED, false);
/** Max lines returned per log read request (hard cap). */
export const APP_LOG_VIEW_MAX_LINES = Math.min(
  5000,
  Math.max(1, toNumber(process.env.APP_LOG_VIEW_MAX_LINES, 2000))
);
/** Max bytes read from end of a plain `.log` file when tailing. */
export const APP_LOG_VIEW_TAIL_BYTES = Math.min(
  16 * 1024 * 1024,
  Math.max(4096, toNumber(process.env.APP_LOG_VIEW_TAIL_BYTES, 2 * 1024 * 1024))
);
/** Max compressed size for full `.gz` read + gunzip in memory. */
export const APP_LOG_VIEW_GZIP_MAX_BYTES = Math.min(
  32 * 1024 * 1024,
  Math.max(65536, toNumber(process.env.APP_LOG_VIEW_GZIP_MAX_BYTES, 10 * 1024 * 1024))
);
