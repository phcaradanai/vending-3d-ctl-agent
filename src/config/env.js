import "dotenv/config";

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
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
export const SERIAL_WRITE_TIMEOUT_MS = toNumber(
  process.env.SERIAL_WRITE_TIMEOUT_MS,
  (1 * (50 * 1000))
);
export const SERIAL_API_TIMEOUT_MS = toNumber(
  process.env.SERIAL_API_TIMEOUT_MS,
  (1 * (60 * 1000))
);
export const SERIAL_WRITE_DEBUG = toBoolean(process.env.SERIAL_WRITE_DEBUG, false);
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
