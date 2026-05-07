import "dotenv/config";

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

export const PORT = toNumber(process.env.PORT, 3000);
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
  process.env.Serial_NAVIGATION_LIGHTS ||  "/dev/ttyUSB0";
  process.env.SERIAL_NAVIGATION_LIGHTS ||   "/dev/ttyUSB1";
  
export const SERIAL_NAVIGATION_LIGHTS_BAUD_RATE = toNumber(
  process.env.SERIAL_NAVIGATION_LIGHTS_BAUD_RATE,
  9600
);
export const SERIAL_WRITE_TIMEOUT_MS = toNumber(
  process.env.SERIAL_WRITE_TIMEOUT_MS,
  3000
);
export const API_LOG_RETENTION_DAYS = toNumber(
  process.env.API_LOG_RETENTION_DAYS,
  30
);
