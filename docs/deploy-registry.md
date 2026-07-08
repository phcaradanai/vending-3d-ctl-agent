# Build + push — registry.rd.ns.co.th

Builds the image on branch `dispenser` (has the SY600 response frame-matching fix,
`src/services/sy600.service.js`) and pushes to the private registry for deploy on
`10.8.0.44`.

## One-time: login

```bash
docker login registry.rd.ns.co.th
```

Needs an interactive TTY (username/password prompt) — run it directly in a real
terminal, not piped/backgrounded. Credentials persist in `~/.docker/config.json`
after this, so it's only needed once per machine (until the login expires).

## Build + tag + push

```bash
# from repo root, on branch `dispenser`
git checkout dispenser
git pull

REGISTRY="registry.rd.ns.co.th/chularat3inter/vending-3d-ctl"
VERSION="$(node -p "require('./package.json').version")"   # e.g. 1.0.0

docker build --no-cache \
  --build-arg APP_VERSION="$VERSION" \
  -t "$REGISTRY:latest" \
  -t "$REGISTRY:$VERSION" \
  .

docker push "$REGISTRY:latest"
docker push "$REGISTRY:$VERSION"
```

```cmd

dir Dockerfile

set VERSION=1.0.0
set REGISTRY=registry.rd.ns.co.th/chularat3inter/vending-3d-ctl

docker build --no-cache --build-arg APP_VERSION=%VERSION% -t %REGISTRY%:latest -t %REGISTRY%:%VERSION% .

docker push %REGISTRY%:latest
docker push %REGISTRY%:%VERSION%

```

## On 10.8.0.44 — pull + restart the stack

```bash
docker pull registry.rd.ns.co.th/chularat3inter/vending-3d-ctl:latest
docker compose up -d --force-recreate
```

(adjust to whatever compose file / service name the running stack actually uses)

## Notes

- Tag with both `latest` and the `package.json` version so a bad deploy can be
  rolled back to a known version tag instead of just "whatever latest was before".
- `--no-cache` matches the convention already documented at the top of the
  `Dockerfile` — guards against a stale `npm ci` layer shipping old deps.
- This image alone does **not** fix the vending-response-decoding symptom reported
  earlier (lift moves correctly but response reads as an error). That turned out to
  be a wire-level RX corruption on the SY600 serial line (deterministic, non-random,
  confirmed from `events-serial.log` going back to today's earlier tests before any
  code change) — a hardware/serial-config issue, not something a code fix or this
  image resolves. See conversation history / `sy600.service.js` comments for the
  frame-matching fix that *is* included (handles the documented async `0xE0`
  interleaving case, gives a clear error instead of a nonsense "expected 59125
  bytes" crash) — necessary, not sufficient.
