# vending-3d-ctl — production image (Node 20 LTS, Debian bookworm slim)
# Build:  docker build --no-cache -t registry.rd.ns.co.th/vending-3d-ctl:latest .
# Run:    docker run --rm -p 3303:3303 --env-file .env -v ./logs:/app/logs vending-3d-ctl:latest
#
# Persist API + log-agent files by mounting a host directory to /app/logs (access.log, events-*.log).
# Release id: package.json "version" (ISO/IEC 29110-4/5 Basic profile). Image label APP_VERSION may be set at build:
#   docker build --build-arg APP_VERSION=1.2.3 -t vending-3d-ctl:1.2.3 .

# FROM node:20-bookworm-slim
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*



WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Writable log dir when no volume is mounted (optional; compose usually mounts ./logs).
RUN mkdir -p /app/logs

ARG APP_VERSION=1.0.0
LABEL org.opencontainers.image.title="vending-3d-ctl" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.description="Vending 3-door control; SCI versioning per ISO/IEC 29110-4/5 Basic profile (runtime version from package.json)."

VOLUME ["/app/logs"]

EXPOSE 3303

ENV NODE_ENV=production

CMD ["node", "index.js"]
