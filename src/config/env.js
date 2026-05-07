import "dotenv/config";

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const PORT = toNumber(process.env.PORT, 3000);
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
export const SERIAL_WRITE_TIMEOUT_MS = toNumber(
  process.env.SERIAL_WRITE_TIMEOUT_MS,
  3000
);
export const API_LOG_RETENTION_DAYS = toNumber(
  process.env.API_LOG_RETENTION_DAYS,
  30
);
