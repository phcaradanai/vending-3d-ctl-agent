import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import morgan from "morgan";
import { createStream } from "rotating-file-stream";
import healthRouter from "./routes/health.routes.js";
import serialRouter from "./routes/serial.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";
import { setupSwagger } from "./docs/swagger.js";
import { API_LOG_RETENTION_DAYS, APP_TIMEZONE } from "./config/env.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDirectory = path.resolve(__dirname, "../logs");

// Ensure log directory exists before creating rotating stream.
fs.mkdirSync(logsDirectory, { recursive: true });

// Rotate API logs daily and keep history for configured days.
const accessLogStream = createStream("access.log", {
  interval: "1d",
  maxFiles: API_LOG_RETENTION_DAYS,
  path: logsDirectory,
});

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatClfDateInTimezone(timezone) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "longOffset",
  });
  const parts = formatter.formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const day = get("day");
  const month = monthNames[Number(get("month")) - 1];
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");
  const tzOffset = get("timeZoneName").replace("GMT", "");
  const normalizedOffset =
    tzOffset.length === 3 ? `${tzOffset}${pad2(0)}` : tzOffset.replace(":", "");
  return `${day}/${month}/${year}:${hour}:${minute}:${second} ${normalizedOffset}`;
}

morgan.token("localDateClf", () => formatClfDateInTimezone(APP_TIMEZONE));
const combinedWithAppTimezone =
  ':remote-addr - :remote-user [:localDateClf] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';

app.use(cors());
app.use(express.json());
// Write access logs to logs/access.log with daily rotation.
app.use(morgan(combinedWithAppTimezone, { stream: accessLogStream }));
// Also print request logs to stdout for local debugging.
app.use(morgan(combinedWithAppTimezone));
setupSwagger(app);

app.use(healthRouter);
app.use(serialRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
