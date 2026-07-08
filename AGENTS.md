# Repository Guidelines

## Project Structure & Module Organization

This repository is a Node.js ESM API for controlling vending hardware over serial ports, with optional MQTT publishing for QR/NFC scans. The runtime entry point is `index.js`; main application code lives in `src/`.

- `src/app.js` wires the Express app, routes, middleware, Swagger docs, and logging.
- `src/config/` contains environment parsing and defaults.
- `src/controllers/`, `src/routes/`, and `src/middleware/` hold HTTP request handling.
- `src/services/` contains serial, MQTT, and vending command logic.
- `src/docs/swagger.js` defines OpenAPI documentation.
- `docs/` is for repository documentation; `logs/` is runtime output and should not be committed.

## Build, Test, and Development Commands

- `npm install` or `make install`: install dependencies.
- `npm start` or `make start`: run `node index.js`.
- `make check`: run `node --check` against key source files for syntax validation.
- `npm test` or `make test`: currently runs the placeholder package script and exits with failure until real tests are added.
- `docker build -t vending-3d-ctl:latest .`: build the container image.
- `docker compose up -d --build`: build and run the service with Compose.

## Coding Style & Naming Conventions

Use modern JavaScript modules (`import`/`export`) and keep files focused by layer. Existing filenames use lower-case descriptive names with role suffixes, such as `serial.controller.js`, `health.routes.js`, and `error.middleware.js`; follow that pattern for new modules. Prefer `const` by default, `let` only for reassignment, and explicit environment defaults in `src/config/env.js`.

## Testing Guidelines

There is no active test framework configured yet. When adding tests, wire `npm test` to the chosen runner and place tests near the module they cover or under a clear `test/` directory. Cover serial payload validation, timeout behavior, route responses, and MQTT publish decisions. Until then, run `make check` before committing.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `add timeout api` and `make docker build`. Keep commit subjects concise and behavior-focused. Pull requests should describe the change, list verification commands, mention affected serial/MQTT/API behavior, link related issues when available, and include screenshots only for visible API documentation changes.

## Security & Configuration Tips

Do not commit `.env`, serial device secrets, or runtime logs. Start from `.env.example`, verify COM or `/dev/ttyUSB*` mappings locally, and keep `SERIAL_API_TIMEOUT_MS` greater than or equal to `SERIAL_WRITE_TIMEOUT_MS` when changing timeout settings.
