import "dotenv/config";
import crypto from "node:crypto";

/**
 * Loads configuration from `process.env`.
 * Variable names and section order mirror `.env.example` / `.env`.
 * Legacy aliases: `Serial_VENDING`, `Serial_NAVIGATION_LIGHTS`, `Serial_QR_NFC` (same as `SERIAL_*`).
 * CORS: `CORS_ALLOWED_ORIGINS`; QR-NFC framing: `SERIAL_QR_NFC_FRAME_IDLE_MS`.
 * MQTT Mifare prefixes: `MQTT_QRNFC_MIFARE_SIGNATURE` — hex bytes comma-separated; use `|` between alternates (e.g. ZK QR500-bm on Linux `02,01,01,09,00` vs Windows `02,FF,01,09,00`).
 * Optional SCI id in CMDB: `SOFTWARE_CI_ID` (see `softwareIdentification.js`).
 */

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

/** Default Mifare-classic prefixes: Windows-style `02 FF…` and Linux (ZK QR500-bm) `02 01…` on same hardware. */
const DEFAULT_MIFARE_SIGNATURES = [
  [0x02, 0xff, 0x01, 0x09, 0x00],
  [0x02, 0x01, 0x01, 0x09, 0x00],
];

/**
 * Parse `MQTT_QRNFC_MIFARE_SIGNATURE`: comma-separated hex bytes; use `|` between alternate headers.
 * @param {string | undefined} value
 * @returns {number[][] | null} null = use built-in defaults
 */
function parseMifareSignatureEnv(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const segments = raw.split("|").map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const seg of segments) {
    const arr = toHexByteArray(seg, null);
    if (arr && arr.length) out.push(arr);
  }
  return out.length ? out : null;
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

// --- HTTP ---
export const PORT = toNumber(process.env.PORT, 3000);

/**
 * CORS: comma-separated allowed `Origin` values (e.g. `http://192.168.1.10:5173`).
 * Empty — reflect the request `Origin` (good for Swagger on another host + Bearer).
 * `*` — allow any origin (wildcard; do not combine with credentialed cookies).
 */
export const CORS_ALLOWED_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || "").trim();

// --- API auth (`/api/v1/*` except GET /health when token set) ---
/**
 * When non-empty, protected routes under `/api/v1` require `Authorization: Bearer <this value>`.
 * `GET /api/v1/health` stays public for probes. Set `API_BEARER_REQUIRED=true` to refuse startup without a token.
 */
export const API_BEARER_TOKEN = String(process.env.API_BEARER_TOKEN || "").trim();

/**
 * When true, `API_BEARER_TOKEN` must be set or the process exits on boot (no unsecured command API by accident).
 */
export const API_BEARER_REQUIRED = toBoolean(process.env.API_BEARER_REQUIRED, false);

// --- Identity (used in MQTT topic template `${CUSTOMER_CODE}` / `${VENDING_CODE}`) ---
export const CUSTOMER_CODE = String(process.env.CUSTOMER_CODE || "wnyh").trim() || "wnyh";
export const VENDING_CODE = String(process.env.VENDING_CODE || "FFFFFFFF").trim() || "FFFFFFFF";
// Immutable cabinet identity used for Core routing. Keep this as the canonical
// code (not a database id); VENDING_CODE remains a backwards-compatible alias.
export const KIOSK_CODE = String(process.env.KIOSK_CODE || VENDING_CODE).trim() || VENDING_CODE;
export const DOOR_TYPE_STANDBY = toNumberArray(process.env.DOOR_TYPE_STANDBY, [1, 2, 3]);
export const DOOR_TYPE_NOW = toNumberArray(process.env.DOOR_TYPE_NOW, [1, 2, 3]);

// --- Timezone (log rotation boundary; also reads `TZ`) ---
export const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || "Asia/Bangkok";
process.env.TZ = APP_TIMEZONE;

// --- Morgan `logs/access.log` rotation ---
export const API_LOG_RETENTION_DAYS = toNumber(process.env.API_LOG_RETENTION_DAYS, 30);

// --- JSON log agent (`logs/events-*.log`) ---
/** Set false to disable file writes. */
export const APP_LOG_AGENT_ENABLED = toBoolean(process.env.APP_LOG_AGENT_ENABLED, true);
/** Soft retention hint (days); used with chunk estimate for default `APP_LOG_MAX_ROTATED_FILES`. */
export const APP_LOG_RETENTION_DAYS = toNumber(process.env.APP_LOG_RETENTION_DAYS, 30);
/** Rotate active `events-*.log` when it exceeds this size (e.g. `32M`, `10M`). */
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

// --- Log view HTTP API ---
/** When true, expose `GET /logs` and `GET /logs/:category`. Default off. */
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

// --- Serial: vending ---
export const SERIAL_VENDING =
  process.env.Serial_VENDING || process.env.SERIAL_VENDING || "/dev/ttyUSB0";
export const SERIAL_VENDING_BAUD_RATE = toNumber(
  process.env.SERIAL_VENDING_BAUD_RATE,
  9600
);

// --- Serial: navigation lights ---
export const SERIAL_NAVIGATION_LIGHTS =
  process.env.Serial_NAVIGATION_LIGHTS ||
  process.env.SERIAL_NAVIGATION_LIGHTS ||
  "/dev/ttyUSB1";
export const SERIAL_NAVIGATION_LIGHTS_BAUD_RATE = toNumber(
  process.env.SERIAL_NAVIGATION_LIGHTS_BAUD_RATE,
  9600
);

// --- Serial: QR NFC ---
export const SERIAL_QR_NFC =
  process.env.Serial_QR_NFC || process.env.SERIAL_QR_NFC || "/dev/ttyUSB2";
export const SERIAL_QR_NFC_BAUD_RATE = toNumber(
  process.env.SERIAL_QR_NFC_BAUD_RATE,
  9600
);
/**
 * After last RX byte, wait this long (no `\\n` delimiter) before flushing one QR-NFC frame.
 * Increase on Linux if scans split/merge (e.g. 120–200). Capped 10..2000 ms.
 */
export const SERIAL_QR_NFC_FRAME_IDLE_MS = Math.min(
  2000,
  Math.max(10, toNumber(process.env.SERIAL_QR_NFC_FRAME_IDLE_MS, 80))
);

// --- Serial: compressor / cabinet board (lights, compressor, temperature — SY600 0x43/0x4A frames) ---
/**
 * Leave empty to send cabinet frames on the vending port (legacy single-port wiring).
 * Set to a distinct device (e.g. `/dev/ttyS1`) when the cabinet board has its own COM.
 */
export const SERIAL_COMPRESSOR =
  String(process.env.Serial_COMPRESSOR || process.env.SERIAL_COMPRESSOR || "").trim();
export const SERIAL_COMPRESSOR_BAUD_RATE = toNumber(
  process.env.SERIAL_COMPRESSOR_BAUD_RATE,
  9600
);

// --- SY600 ---
export const SY600_DEVICE_ADDRESS_HEX =
  process.env.SY600_DEVICE_ADDRESS_HEX || "AABBCCDD";
export const SY600_USE_CRC16 = toBoolean(process.env.SY600_USE_CRC16, false);

// --- Serial policy ---
export const SERIAL_WRITE_TIMEOUT_MS = toNumber(
  process.env.SERIAL_WRITE_TIMEOUT_MS,
  1 * (50 * 1000)
);
export const SERIAL_API_TIMEOUT_MS = toNumber(
  process.env.SERIAL_API_TIMEOUT_MS,
  1 * (60 * 1000)
);
// The dispenser request remains open until the user removes the item from
// the pickup compartment. Keep these separate from serial RX timeouts so the
// physical queue cannot advance before pickup is confirmed.
export const PICKUP_CONFIRMATION_TIMEOUT_MS = Math.max(
  1000,
  toNumber(process.env.PICKUP_CONFIRMATION_TIMEOUT_MS, 120 * 1000)
);
export const PICKUP_CONFIRMATION_POLL_MS = Math.min(
  5000,
  Math.max(50, toNumber(process.env.PICKUP_CONFIRMATION_POLL_MS, 250))
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

// --- MQTT ---
export const MQTT_ENABLED = toBoolean(process.env.MQTT_ENABLED, false);
export const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://127.0.0.1:1883";
const _mqttClientIdBase = String(process.env.MQTT_CLIENT_ID || "vending-3d-ctl").trim() || "vending-3d-ctl";
export const MQTT_CLIENT_ID = `${_mqttClientIdBase}-${crypto.randomUUID().slice(0, 8)}`;
export const MQTT_USERNAME = process.env.MQTT_USERNAME || "";
export const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "";
export const MQTT_QRNFC_TOPIC = resolveEnvTemplate(
  process.env.MQTT_QRNFC_TOPIC || "hm/${CUSTOMER_CODE}/${VENDING_CODE}/reader"
);
export const MQTT_QRNFC_QOS = toNumber(process.env.MQTT_QRNFC_QOS, 0);
export const MQTT_QRNFC_RETAIN = toBoolean(process.env.MQTT_QRNFC_RETAIN, false);
/** Mifare frame prefixes (5 bytes typical). Use `|` in env for alternates (e.g. ZK QR500-bm on Linux vs Windows). */
export const MQTT_QRNFC_MIFARE_SIGNATURES =
  parseMifareSignatureEnv(process.env.MQTT_QRNFC_MIFARE_SIGNATURE) ??
  DEFAULT_MIFARE_SIGNATURES.map((row) => [...row]);

/** @deprecated use `MQTT_QRNFC_MIFARE_SIGNATURES` — first configured prefix */
export const MQTT_QRNFC_MIFARE_SIGNATURE = MQTT_QRNFC_MIFARE_SIGNATURES[0];

/**
 * @param {Buffer | number[]} input
 * @returns {{ headerLength: number; signature: number[] } | null}
 */
export function matchQrNfcMifareFromBytes(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  for (const sig of MQTT_QRNFC_MIFARE_SIGNATURES) {
    const hl = sig.length;
    if (bytes.length >= hl + 4 && sig.every((b, i) => bytes[i] === b)) {
      return { headerLength: hl, signature: sig };
    }
  }
  return null;
}

export const MQTT_QRNFC_BARCODE_WNY_SIGNATURE_REGEX = toRegex(
  process.env.MQTT_QRNFC_BARCODE_WNY_SIGNATURE_REGEX ||
    "([0-9a-f\\-]{36})_(\\d{8})_(\\d+)_(\\d+)_(IN|OUT)_(\\d{14})",
  /([0-9a-f\-]{36})_(\d{8})_(\d+)_(\d+)_(IN|OUT)_(\d{14})/i
);

// --- NATS JetStream (unified QR / barcode / NFC events to Core) ---
export const NATS_ENABLED = toBoolean(process.env.NATS_ENABLED, false);
export const NATS_URL = String(process.env.NATS_URL || "nats://127.0.0.1:4222").trim();
export const NATS_CLIENT_NAME = String(
  process.env.NATS_CLIENT_NAME || `vending-${KIOSK_CODE}`
).trim();
export const NATS_SCANNER_SUBJECT = String(
  process.env.NATS_SCANNER_SUBJECT || "medisync.scanner.read"
).trim();
export const NATS_SCANNER_STREAM = String(
  process.env.NATS_SCANNER_STREAM || "MEDISYNC"
).trim();

if (API_BEARER_REQUIRED && !API_BEARER_TOKEN) {
  console.error(
    "[env] API_BEARER_REQUIRED=true but API_BEARER_TOKEN is empty. Set API_BEARER_TOKEN to a long random secret."
  );
  process.exit(1);
}
