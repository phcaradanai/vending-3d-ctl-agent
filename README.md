# vending-3d-ctl

Node.js (ESM) API for vending controller with dual serial channels:
- Vending controller serial
- Navigation lights serial

## Requirements

- Node.js 18+
- Access to serial devices (Linux example: `/dev/ttyUSB0`, `/dev/ttyUSB1`)

## Install

```bash
npm install
```

or

```bash
make install
```

## Configuration

Copy `.env.example` to `.env` and adjust values:

```env
PORT=3000
VENDING_CODE=FFFFFFFF
DOOR_TYPE_STANDBY=[1,2,3]
DOOR_TYPE_NOW=[1,2,3]
APP_TIMEZONE=Asia/Bangkok
API_LOG_RETENTION_DAYS=30
Serial_VENDING=/dev/ttyUSB0
SERIAL_VENDING_BAUD_RATE=9600
Serial_NAVIGATION_LIGHTS=/dev/ttyUSB1
SERIAL_NAVIGATION_LIGHTS_BAUD_RATE=9600
SERIAL_WRITE_TIMEOUT_MS=3000
```

Notes:
- On Windows, serial path is usually `COM3`, `COM4`, etc.
- `SERIAL_WRITE_TIMEOUT_MS` is used to prevent hanging HTTP requests.

## Run

```bash
npm start
```

or

```bash
make start
```

## API Endpoints

- Base path: `/api/v1`

- `GET /api/v1/health`
  - Returns status and current serial configuration.

- `POST /api/v1/serial/vending/write`
  - Writes text command to vending serial channel.
  - Body:
    ```json
    { "data": "HELLO\n" }
    ```

- `POST /api/v1/serial/navigation-lights/write`
  - Writes text command to navigation-lights serial channel.
  - Body:
    ```json
    { "data": "LIGHT_ON\n" }
    ```

- `POST /api/v1/vending/drugDispenser`
  - Accepts dispenser command payload (requires `prescription`).
  - Body (minimum):
    ```json
    { "prescription": "1234567909" }
    ```

## Swagger

- Swagger UI: `http://localhost:3303/docs`
- API server in Swagger is set to: `http://localhost:3303/api/v1`

## API Logging

- API request logs are enabled with `morgan` middleware.
- Log file path: `logs/access.log`
- Rotation: daily
- Retention: 30 days (configurable via `API_LOG_RETENTION_DAYS`)
- Timezone for rotation boundary: `APP_TIMEZONE=Asia/Bangkok` (UTC+7)
- Current format is `combined` (remote IP, method, path, status, response time).

## Serial behavior

- Both serial ports are opened and listened continuously at startup.
- Incoming hardware data is logged even when there is no API request.
- If serial is disconnected/error, service retries connection automatically.

## Makefile commands

- `make install`
- `make start`
- `make run`
- `make check`
- `make test`
