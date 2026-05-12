# vending-3d-ctl — production image (Node 20 LTS, Debian bookworm slim)
# Build:  docker build -t vending-3d-ctl:latest .
# Run:    docker run --rm -p 3303:3303 --env-file .env -v ./logs:/app/logs vending-3d-ctl:latest
#
# Persist API + log-agent files by mounting a host directory to /app/logs (access.log, events-*.log).

FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Writable log dir when no volume is mounted (optional; compose usually mounts ./logs).
RUN mkdir -p /app/logs

VOLUME ["/app/logs"]

EXPOSE 3303

ENV NODE_ENV=production

CMD ["node", "index.js"]
