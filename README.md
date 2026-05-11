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

- **`GET /api/v1/health`** — Process uptime, MQTT status, serial port health, and write timeout config.

- **`POST /api/v1/serial/vending/write`** — Sends hex bytes to vending serial and waits for RX.  
  Body:

  ```json
  { "data": "EE010000" }
  ```

- **`POST /api/v1/serial/navigation-lights/write`** — Sends navigation command and waits for RX (with retry queue on timeout).  
  Body:

  ```json
  { "data": { "act": "led", "cmd": [1, 165, 0, 128, 0, 1] } }
  ```

- **`POST /api/v1/serial/navigation-lights/write-no-wait`** — Fire-and-forget mode (TX + drain only, no RX wait).  
  Body:

  ```json
  { "data": { "act": "led", "cmd": [1, 165, 0, 128, 0, 1] } }
  ```

- **`POST /api/v1/vending/drugDispenser`** — Dispenser command payload (requires `prescription`).

### SY600 Command API (`/api/v1/sy600/*`)

These endpoints build SY600 binary frames, send via vending serial, then decode response to readable fields and status text.

- `POST /api/v1/sy600/c3/lift`  
  `{ "target": 1 }` (`0` reset, `1..7`, or `0x55..0x57`)
- `POST /api/v1/sy600/c4/micro-step`  
  `{ "layer": 1, "channelStart": 0, "channelEnd": 5, "repeat": 3 }` (`repeat` optional, 1..100)
- `POST /api/v1/sy600/c5/output-door`  
  `{ "action": 1, "doorNo": 1 }`
- `POST /api/v1/sy600/c6/conveyor`  
  `{ "direction": 0, "seconds": 3 }`
- `POST /api/v1/sy600/c7/pickup-door`  
  `{ "action": 1, "doorNo": 1 }`
- `POST /api/v1/sy600/24/reset-scan`  
  `{ "resetDoor": 1, "resetLift": 1 }`
- `POST /api/v1/sy600/35/infrared`  
  `{ "sensorType": 0 }`
- `POST /api/v1/sy600/39/microswitch`  
  `{}`
- `POST /api/v1/sy600/28/dispense`  
  `{ "layerAddressHex":"AABBCCDD", "channelStart":0, "channelEnd":0, "orderIdHex":"0011223344556677" }`
- `POST /api/v1/sy600/e0/ack`  
  `{ "addressHex":"AABBCCDD" }` (optional)

### SY600 Environment

Add these env vars for SY600 framing:

```env
SY600_DEVICE_ADDRESS_HEX=AABBCCDD
SY600_USE_CRC16=false
```

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
