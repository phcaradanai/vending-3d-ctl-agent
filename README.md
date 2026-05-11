# vending-3d-ctl

Node.js (ESM) API for vending control with three serial channels:

- **Vending** — command/response over serial (HTTP waits for RX after each write).
- **Navigation lights** — same write-and-wait pattern as vending.
- **QR/NFC** — scanned data is read continuously; optional MQTT publish when enabled.

## Requirements

- Node.js 18+
- Access to serial devices (Linux: `/dev/ttyUSB*`, Windows: `COM*`)

## Install

```bash
npm install
```

or

```bash
make install
```

## Configuration

Copy `.env.example` to `.env` and adjust values.

### Serial and timeouts

| Variable | Purpose |
|----------|---------|
| `SERIAL_VENDING` | Vending port path (e.g. `COM6`, `/dev/ttyUSB0`) |
| `SERIAL_VENDING_BAUD_RATE` | Baud rate (default `9600`) |
| `SERIAL_NAVIGATION_LIGHTS` | Navigation lights port |
| `SERIAL_NAVIGATION_LIGHTS_BAUD_RATE` | Baud rate (default `9600`) |
| `SERIAL_QR_NFC` | QR/NFC reader port |
| `SERIAL_QR_NFC_BAUD_RATE` | Baud rate (default `9600`) |
| `SERIAL_WRITE_TIMEOUT_MS` | Max time to wait for **any** serial RX after a write (application serial layer). Default in code: `50000` (50s) if unset. |
| `SERIAL_API_TIMEOUT_MS` | HTTP **socket** timeout for `POST /api/v1/serial/vending/write` only (`req`/`res` timeout). Default in code: `60000` (60s) if unset. Should be **≥** `SERIAL_WRITE_TIMEOUT_MS` so the API does not close before the serial wait finishes. |

Other common variables:

```env
PORT=3303
CUSTOMER_CODE=wnyh
VENDING_CODE=FFFFFF12
DOOR_TYPE_STANDBY=[1,2,3]
DOOR_TYPE_NOW=[1,2,3]
APP_TIMEZONE=Asia/Bangkok
API_LOG_RETENTION_DAYS=30

MQTT_ENABLED=false
MQTT_BROKER_URL=mqtt://127.0.0.1:1883
MQTT_CLIENT_ID=vending-3d-ctl
MQTT_QRNFC_TOPIC=hm/${CUSTOMER_CODE}/${VENDING_CODE}/reader
```

Notes:

- On Windows, serial paths are usually `COM3`, `COM6`, etc.
- Serial write bodies must be an **even-length hex string** (spaces allowed; they are stripped before send). Example: `EE010000`.
- If you terminate traffic through a **reverse proxy** (Nginx, load balancer), raise upstream/read timeouts there as well, or long polls may get `502`/`504` from the proxy before this app responds.

## Run

```bash
npm start
```

or

```bash
make start
```

## Docker

Build image:

```bash
docker build -t vending-3d-ctl:latest .
```

Run container:

```bash
docker run --rm -p 3303:3303 --env-file .env -v ./logs:/app/logs vending-3d-ctl:latest
```

Compose:

```bash
docker compose up -d --build
docker compose logs -f
```

Stop compose:

```bash
docker compose down
```

Notes:

- For Linux host serial ports, uncomment `devices` in `docker-compose.yml` and map `/dev/ttyUSB*`.
- For Windows COM ports, serial passthrough depends on Docker Desktop/WSL setup; use Linux device mapping when the container runs on Linux.

## API

- Base path: **`/api/v1`**
- OpenAPI (Swagger UI): **`http://localhost:<PORT>/docs`** (default port `3303`; see `PORT` in `.env`).

### Endpoints

- **`GET /api/v1/health`** — Process uptime, MQTT status, serial port health, and `writeTimeoutMs` from config.

- **`POST /api/v1/serial/vending/write`** — Sends hex bytes to the vending port and **waits** for a response (RX) up to `SERIAL_WRITE_TIMEOUT_MS`. Uses extended HTTP timeout from `SERIAL_API_TIMEOUT_MS` on this route only.  
  Body:

  ```json
  { "data": "EE010000" }
  ```

  Success response includes `responseHex` and `responseBytes`.

- **`POST /api/v1/serial/navigation-lights/write`** — Same contract as vending (hex payload, waits for RX with `SERIAL_WRITE_TIMEOUT_MS`). No separate `SERIAL_API_TIMEOUT_MS` middleware on this route.

- **`POST /api/v1/vending/drugDispenser`** — Dispenser command payload (requires `prescription`).

## API logging

- Request logging uses `morgan`.
- Log file: `logs/access.log`
- Rotation: daily
- Retention: `API_LOG_RETENTION_DAYS` (default 30)
- Rotation boundary timezone: `APP_TIMEZONE` (default `Asia/Bangkok`, UTC+7)
- Format: `combined`

## Serial behavior

- All serial ports are opened and listened to at startup (lazy open + reconnect on error/close).
- **Vending** and **navigation lights**: each HTTP write registers a one-shot listener, sends bytes, then waits for RX (idle gap ~80ms ends the frame, or `SERIAL_WRITE_TIMEOUT_MS` overall).
- **QR/NFC**: framing is newline-based with a short idle fallback; payloads can be published to `MQTT_QRNFC_TOPIC` when `MQTT_ENABLED=true`.

## Makefile commands

- `make install`
- `make start`
- `make run`
- `make check`
- `make test`
