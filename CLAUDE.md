# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # or: make install
npm start         # or: make start   (runs node index.js)
make run          # runs node apps.js (NOTE: this file does not exist in the repo; make run is currently broken)
make check         # syntax-checks core files with `node --check` (apps.js, src/app.js, src/config/env.js,
                    # src/controllers/serial.controller.js, src/services/serial.service.js)
```

There is no real test suite — `npm test` / `make test` just runs `echo "Error: no test specified" && exit 1`.

Docker:

```bash
docker build -t vending-3d-ctl:latest .
docker run --rm -p 3303:3303 --env-file .env -v ./logs:/app/logs vending-3d-ctl:latest
docker compose up -d --build
```

Config: copy `.env.example` to `.env`. Key vars: `SERIAL_VENDING`, `SERIAL_NAVIGATION_LIGHTS`, `SERIAL_QR_NFC` (port paths, e.g. `COM6` on Windows or `/dev/ttyUSB0` on Linux) with matching `*_BAUD_RATE`; optional `SERIAL_COMPRESSOR` (separate COM for the cabinet/compressor board — SY600 `0x43`/`0x4A` frames; empty = reuse the vending port); `SERIAL_WRITE_TIMEOUT_MS` (serial RX wait) and `SERIAL_API_TIMEOUT_MS` (HTTP socket timeout for the vending write route only — must be >= `SERIAL_WRITE_TIMEOUT_MS`).

## Architecture

Node.js (ESM, `"type": "module"`) Express 5 API that bridges HTTP to three hardware serial channels. Entry point `index.js` calls `initializeMqttPublisher()` then `await initializeSerialListeners()` before starting the HTTP server — serial ports must be opened (or scheduled for reconnect) before the app accepts traffic.

Layout: `src/app.js` (Express app, middleware, morgan logging, swagger) → `src/routes/*` → `src/middleware/validate*.middleware.js` → `src/controllers/serial.controller.js` → `src/services/serial.service.js` (all serial I/O) / `src/services/mqtt.service.js` (MQTT publish). Config is centralized in `src/config/env.js`, which parses and defaults every env var — never read `process.env` directly elsewhere.

### The three serial channels (all state lives in `src/services/serial.service.js`)

- **Vending** (`SERIAL_VENDING`) — request/response: `POST /api/v1/serial/vending/write` writes a hex payload and awaits RX. Uses an extended HTTP socket timeout (`SERIAL_API_TIMEOUT_MS`, set per-route in `serial.routes.js`) in addition to the serial-level `SERIAL_WRITE_TIMEOUT_MS`.
- **Navigation lights** (`SERIAL_NAVIGATION_LIGHTS`) — same write-and-wait pattern via `writeToPort`, but `POST /api/v1/serial/navigation-lights/write` takes a JSON object body (validated by `validateSerialWriteNavigationLights`), which is JSON-stringified and hex-encoded before writing (see `writeNavigationLightsSerialData`). No extended HTTP timeout on this route.
- **QR/NFC** (`SERIAL_QR_NFC`) — passive/continuous read, not tied to any HTTP request. Framing is newline-delimited with an 80ms idle-gap fallback (`handleQrNfcChunk` / `flushQrNfcFrame`). Frames are classified (`nfc-mifare` vs `qrcode_wny` vs `qrcode_unknown`, see `MQTT_QRNFC_MIFARE_SIGNATURE` / `MQTT_QRNFC_BARCODE_WNY_SIGNATURE_REGEX`) and published to MQTT topic `MQTT_QRNFC_TOPIC` when `MQTT_ENABLED=true`.

All three ports use the same lazy-open-and-reuse pattern (`getPort`) and auto-reconnect with a 2s backoff on `close`/`error` (`scheduleReconnect`), guarded per-channel by a reconnect-timer flag so reconnects don't stack. `writeToPort` is the shared low-level primitive for vending and navigation-lights: it validates hex, writes bytes, and resolves once RX goes idle for 80ms or `SERIAL_WRITE_TIMEOUT_MS` elapses (whichever first); a timeout without any RX rejects with HTTP 504.

`GET /api/v1/health` reports process uptime, MQTT connection status, and per-port serial health (`getSerialHealthSnapshot`) — useful for diagnosing a disconnected/misconfigured COM port without touching hardware.

`POST /api/v1/vending/drugDispenser` (`src/routes/drugDispenser.routes.js`) is a synchronous stub: it validates `prescription`, echoes back a fabricated response payload, and does not talk to serial hardware. `src/services/vending/vending.3d.service.js` exists but is currently empty — dispenser logic has not been implemented there yet.

Errors are centralized in `src/middleware/error.middleware.js`: any thrown/rejected error with a `.status` property (e.g. 400 for validation, 504 for serial timeout) is surfaced with that status code; otherwise it falls back to 500.

API docs are hand-maintained as a static OpenAPI object in `src/docs/swagger.js` (not auto-generated from routes) and served at `/docs`. When adding/changing a route, update this file too.

Access logs go to `logs/access.log` (daily rotation via `rotating-file-stream`, retained `API_LOG_RETENTION_DAYS` days, rotation boundary aligned to `APP_TIMEZONE`) and are also printed to stdout.
