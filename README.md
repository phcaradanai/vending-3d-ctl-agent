# vending-3d-ctl

Node.js (ESM) API for vending control with three serial channels:

- **Vending** — hex payloads over serial; HTTP waits for RX after each write (SY600 helpers use this port).
- **Navigation lights** — JSON `data` object is serialized to a line (`JSON.stringify` + newline), then sent; HTTP can wait for RX (with retries) or use fire-and-forget.
- **QR/NFC** — scanned data is read continuously; optional MQTT publish and a
  unified QR/barcode/NFC event to MediSync Core over NATS JetStream.
  MediSync can also consume the same cabinet-local stream at
  `GET /api/v1/qr-nfc/events` (Bearer protected, Server-Sent Events).

## Requirements

- Node.js 18+ (local dev); the bundled **Dockerfile** uses **Node 20** bookworm slim.
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
| `KIOSK_CODE` | Stable cabinet code used for Core routing (defaults to `VENDING_CODE`) |
| `SERIAL_WRITE_TIMEOUT_MS` | Max time to wait for **any** serial RX after a write (application serial layer). Default in code: `50000` (50s) if unset. |
| `SERIAL_API_TIMEOUT_MS` | HTTP **socket** timeout for `POST /api/v1/serial/vending/write` only (`req`/`res` timeout). Default in code: `60000` (60s) if unset. Should be **≥** `SERIAL_WRITE_TIMEOUT_MS` so the API does not close before the serial wait finishes. |
| `PICKUP_CONFIRMATION_TIMEOUT_MS` | Max time a Sticker dispense waits for the pickup sensor to confirm the item was removed (default `120000` ms). |
| `PICKUP_CONFIRMATION_POLL_MS` | Poll interval for the pickup/drop sensor (default `250` ms). |
| `SERIAL_WRITE_DEBUG` | Log TX/RX hex and byte arrays for serial writes (`true`/`false`, default `false`). |
| `SERIAL_PORT_QUEUE_LOG` | Log per-COM write queue: enqueue / run / done and waiting labels (default `true`; set `false` to quiet). |
| `APP_LOG_AGENT_ENABLED` | Write structured JSON to `logs/events-*.log` (default `true`). |
| `APP_LOG_RETENTION_DAYS` | Used with default rotated-file cap: `48 ×` this value for `APP_LOG_MAX_ROTATED_FILES` when unset (default `30`). |
| `APP_LOG_CHUNK_SIZE` | Max size of the **active** `events-*.log` before it rotates to a dated chunk (default `32M`). Prevents one file from growing for the whole retention window. |
| `APP_LOG_ROTATED_MAX_TOTAL` | Max **total** size of rotated archives **per** `events-*` category (`rotating-file-stream` `maxSize`, default `1G`). Set empty to disable. |
| `APP_LOG_MAX_ROTATED_FILES` | Max number of rotated files per category (default `48 × APP_LOG_RETENTION_DAYS`). Set `0` for no file-count cap. |
| `APP_LOG_COMPRESS_ROTATED` | If `true`, gzip rotated chunks (active log stays plain `.log`). Default `false`. |
| `API_BEARER_TOKEN` | When non-empty, **every** request under **`/api/v1/*`** must send **`Authorization: Bearer <API_BEARER_TOKEN>`**. Leave empty only for local dev without auth. |
| `APP_LOG_VIEW_API_ENABLED` | If `true`, enables **`GET /api/v1/logs`** and **`GET /api/v1/logs/:category`** (still needs Bearer when `API_BEARER_TOKEN` is set). Default **`false`** (**404** when off). |
| `APP_LOG_VIEW_MAX_LINES` | Hard cap on `lines` per tail request (default **2000**, max **5000**). |
| `APP_LOG_VIEW_TAIL_BYTES` | Max bytes read from the **end** of a plain `.log` file when tailing (default **2MiB**). |
| `APP_LOG_VIEW_GZIP_MAX_BYTES` | Max **compressed** size for a `.gz` log loaded fully into memory for tailing (default **10MiB**). |
| `SERIAL_NAVIGATION_LIGHTS_FRAME_DEBUG` | Extra logging around navigation-lights framing (`false` by default). |
| `SERIAL_NAVIGATION_LIGHTS_WRITE_RETRY` | After a **504** RX timeout on nav lights, how many **extra** attempts (default `2` → up to 3 tries total). |
| `SERIAL_NAVIGATION_LIGHTS_RETRY_DELAY_MS` | Pause between nav-light retries in ms (default `250`). |

Other common variables:

```env
PORT=3303
CUSTOMER_CODE=wnyh
VENDING_CODE=FFFFFF12
KIOSK_CODE=FFFFFF12
DOOR_TYPE_STANDBY=[1,2,3]
DOOR_TYPE_NOW=[1,2,3]
APP_TIMEZONE=Asia/Bangkok
API_LOG_RETENTION_DAYS=30
API_BEARER_TOKEN=

MQTT_ENABLED=false
MQTT_BROKER_URL=mqtt://127.0.0.1:1883
MQTT_CLIENT_ID=vending-3d-ctl
MQTT_QRNFC_TOPIC=hm/${CUSTOMER_CODE}/${VENDING_CODE}/reader

NATS_ENABLED=false
NATS_URL=nats://127.0.0.1:4222
NATS_CLIENT_NAME=vending-FFFFFF12
NATS_SCANNER_SUBJECT=medisync.scanner.read
NATS_SCANNER_STREAM=MEDISYNC
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

The app writes **Morgan `access.log`** and the **JSON log agent** files under **`/app/logs`**. In production, always **mount a host directory** to `/app/logs` so logs persist and stay inspectable from the host.

### `docker run`

```bash
docker build -t vending-3d-ctl:latest .
docker run --rm -p 3303:3303 --env-file .env -v ./logs:/app/logs vending-3d-ctl:latest
```

Adjust **`PORT`** in `.env` if you map a different host port; keep **`-p $PORT:$PORT`** in sync.

### Compose — two layouts

| File | Use case |
|------|-----------|
| **`docker-compose.yml`** | **Build image from this repo** (`build:` + optional tag `VENDING_CTL_IMAGE_LOCAL`, default `vending-3d-ctl:local`). |
| **`docker-compose.image.yml`** | **Use a pre-built image** from a registry (`image:`; override with env **`VENDING_CTL_IMAGE`**). |

**Build locally (default compose file):**

```bash
cp .env.example .env   # then edit
docker compose up -d --build
docker compose logs -f
docker compose down
```

**Pull / run a registry image (no build):**

```bash
cp .env.example .env
# optional: export VENDING_CTL_IMAGE=registry.example.com/vending-3d-ctl:1.2.3
docker compose -f docker-compose.image.yml pull
docker compose -f docker-compose.image.yml up -d
docker compose -f docker-compose.image.yml logs -f
```

Both compose files:

- Use **`env_file: .env`** — keep secrets and `PORT` there.
- Mount **`./logs:/app/logs`** — rotated logs and `access.log` land on the host under `./logs`.

**Linux serial:** uncomment `devices:` (and `privileged:` if your setup requires it) in the compose file you use. **Windows COM** inside Docker is limited; run the Node process on Windows for native `COM*` access, or use Linux hosts with USB device mapping.

## API

- Base path: **`/api/v1`**
- OpenAPI (Swagger UI): **`http://localhost:<PORT>/docs`** (default port `3303`; see `PORT` in `.env`).
- When **`API_BEARER_TOKEN`** is set in `.env`, send **`Authorization: Bearer <same value>`** on every **`/api/v1/*`** request (including **`GET /health`**). **`/docs`** is not protected by this middleware; use Swagger **Authorize** to attach the token to Try it out requests.

### Endpoints

- **`GET /api/v1/health`** — Structured status:
  - **`summary`** — `systemStatus`, `alertsCount`, serial/MQTT/SY600 quick fields.
  - **`devices`** — Serial channels (config + live connection), **`devices.serial.writeQueues`** (คิวเขียน per COM: `waitingJobs` / `runningJob` แต่ละตัวมี **`txHex`** (cmd บน wire), รวมถึง `waitingLabels`, `busy`, `activeQueueKeys`), MQTT snapshot + topic routing, SY600 transport/protocol hints.
  - **`diagnostics`** — Process uptime, `memoryUsage`, serial policy (`writeTimeoutMs`, `apiTimeoutMs`, navigation retry), and app time/timezone.
  - **`alerts`** — Warnings (e.g. serial port down, MQTT enabled but disconnected).

- **`GET /api/v1/job/que`** — Serial write queue only: `writeQueues` (รวม `waitingJobs` / `runningJob` + **txHex** เหมือน `/health`), `timestamp`, and `portQueueConsoleLog`.

- **`GET /api/v1/logs`** — (เมื่อ `APP_LOG_VIEW_API_ENABLED=true`) รายการหมวด log และไฟล์ใน `logs/` พร้อมขนาด / เวลาแก้ไข  
- **`GET /api/v1/logs/:category`** — tail บรรทัดจากไฟล์ active หรือระบุ `?file=<basename>&lines=<n>` (`category`: `http` | `serial` | `queue` | `sy600` | `mqtt` | `app` | `error` | `access`)  
  - ใช้ **`Authorization: Bearer`** ตาม **`API_BEARER_TOKEN`** เหมือน endpoint อื่นทั้งหมด

- **`POST /api/v1/serial/vending/write`** — Sends hex bytes to vending serial and waits for RX.  
  Body:

  ```json
  { "data": "EE010000" }
  ```

- **`POST /api/v1/serial/navigation-lights/write`** — Sends navigation command and waits for RX (with retries on timeout).  
  Body:

  ```json
  { "data": { "act": "led", "cmd": [1, 165, 0, 128, 0, 1] } }
  ```

  For `act: "led"`, `cmd` is six values: **[first LED, last LED, R, G, B, mode]** — R/G/B are `0..255`; **mode `0` = on steady**, **`1` = flash**.

  **200 response** echoes your payload and wraps the serial layer: `{ "success": true, "accepted": { ... }, "serialResponse": { "success", "bytes", "responseHex", "responseBytes" } }`.

- **`POST /api/v1/serial/navigation-lights/write-no-wait`** — Fire-and-forget mode (TX + drain only, no RX wait).  
  Body:

  ```json
  { "data": { "act": "led", "cmd": [1, 165, 0, 128, 0, 1] } }
  ```

  Same `cmd` meaning as the write endpoint above.

- **`POST /api/adm/buzzer`** and **`POST /api/adm/lock`** — ADM JSON commands sent
  through the same `SERIAL_NAVIGATION_LIGHTS` TTY and write queue as LED.

  ```json
  { "control": "buzzer", "cmd": { "status": 1, "time": 1 } }
  { "control": "buzzer", "cmd": { "status": 1, "mode": "custom", "freq": 1500, "timeOn": 80, "timeOff": 120, "time": 5 } }
  { "control": "lock", "cmd": { "status": 1, "time": 15 } }
  ```

  `status` is `0` (off/close) or `1` (on/open). `time` is a non-negative
  integer; the ADM board handles the lock timeout warning buzzer.

- **`POST /api/v1/vending/drugDispenser`** — One Sticker/prescription per physical
  dispense. Items are picked from the highest layer down, delivered once, and
  the request remains open until sensor `0x35` (type `0`, drop/pickup IR)
  detects the item and then detects it has been removed; the pickup door must
  acknowledge closed before the next Sticker on this cabinet can start.

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
- `GET /api/v1/sy600/39/microswitch` — Preferred (no body).  
- `POST /api/v1/sy600/39/microswitch` — Deprecated alias (empty body `{}`); same behavior as GET.
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

### Log agent (`logs/events-*.log`)

Structured **JSON one line per event**. The **active** file is always `events-<category>.log`. It rotates on a **daily** boundary and whenever it exceeds **`APP_LOG_CHUNK_SIZE`** (default **`32M`**), so no single file can grow without bound inside the retention window. Older chunks are named like `events-serial-20260511-p0.log` (optionally **`.gz`** if `APP_LOG_COMPRESS_ROTATED=true`). Total disk per category is capped by **`APP_LOG_ROTATED_MAX_TOTAL`** (default **`1G`**) and/or **`APP_LOG_MAX_ROTATED_FILES`**. Disable the agent with **`APP_LOG_AGENT_ENABLED=false`** (morgan `access.log` is unchanged). Field **`ts`** is wall time in **`APP_TIMEZONE`** with offset (e.g. `…+07:00`), not UTC `Z`.

**Reading large or compressed logs:** use `tail` / `Get-Content -Tail` on the active `events-*.log`; for rotated chunks use a viewer that supports gzip, or e.g. `zcat` / `gzip -dc` on `.gz` files. Prefer searching smaller chunk files rather than opening everything at once.

| File | Contents |
|------|----------|
| `events-http.log` | HTTP responses (`path`, `statusCode`, `durationMs`, `requestId`) |
| `events-serial.log` | Vending / navigation writes (hex prefixes, `act` for nav) |
| `events-queue.log` | Serial write queue (`phase` enqueue/run/done, `label`, `txHex`) |
| `events-sy600.log` | SY600 TX/RX summary per command |
| `events-mqtt.log` | MQTT connect / publish / QR-NFC forward (no passwords) |
| `events-app.log` | Bootstrap and listen |
| `events-error.log` | Express `errorHandler` (status, message, stack, `requestId`) |

## Serial behavior

- All serial ports are opened and listened to at startup (lazy open + reconnect on error/close).
- **Vending**: hex write → wait for RX (idle gap ~80ms ends the frame, or `SERIAL_WRITE_TIMEOUT_MS` overall). Writes are queued per port.
- **Navigation lights**: object `data` → JSON line + `\n` → bytes; wait path uses the same RX idle logic and can **retry** on timeout (`SERIAL_NAVIGATION_LIGHTS_WRITE_RETRY`, `SERIAL_NAVIGATION_LIGHTS_RETRY_DELAY_MS`). **No-wait** path only drains after write.
- **QR/NFC**: framing is newline-based with a short idle fallback. With
  `NATS_ENABLED=true`, every frame is published to Core as one envelope with
  `kioskCode`, `scanType` (`QR`, `BARCODE`, `NFC`), `scanPurpose`
  (`STICKER`, `DRUG_BARCODE`, `USER_NFC`), readable `value`/`parsed`, and
  complete `raw` text/bytes/hex. MQTT remains available for legacy consumers;
  the local `/api/v1/qr-nfc/events` stream is retained for diagnostics.

## Makefile commands

- `make install`
- `make start`
- `make run`
- `make check`
- `make test`
