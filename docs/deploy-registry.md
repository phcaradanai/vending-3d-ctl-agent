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

set VERSION=1.0.5
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

### 2026-07-08 — full flow validated end-to-end, live, on the physical unit

Drove the complete pick-and-deliver sequence one manual `/sy600/*` call at a
time (door 1, layer 1, channel 1-3) with a human watching the machine after
every step:

`lift → floor` → `dispense (0xC4)` → `lift → delivery point` → `output door open`
→ `conveyor` → `pickup door open` → *(auto-closed after sensor detected pickup)*
→ `output door close`

**Every step physically executed correctly**, even though every single API
response was still an unparseable-frame 502 (the RX issue above). TX,
command sequencing, and the delivery mechanics are all solid — confirms the
RX decode is the *only* thing standing between this and reporting real
success/fail.

**Found + fixed while testing: `0xC4` layer/channel are 0-indexed, `0xC3`
lift target is 1-indexed.** Requesting `layer=1, channel=1-3` on `0xC4`
physically fired layer 2, channel 2-4 — off by one, and NOT the same offset
convention as the lift command. Fixed in `vending.3d.service.js` (commit
`bfc872e`) — the `items[]` API stays 1-indexed (human-facing: "floor 1,
channel 1-3"), the code subtracts 1 internally only for the `0xC4` call.
Verified live against real hardware after the fix (device layer=0,
channel=0-2 → correctly fired human floor 1, channel 1-3).

**If you're calling the raw `/sy600/c4/micro-step` endpoint directly**
(bypassing `/vending/drugDispenser`), the offset fix does **not** apply —
that endpoint still takes `layer`/`channelStart`/`channelEnd` exactly as
sent, 0-indexed. Subtract 1 yourself from the human floor/channel number,
or use `/vending/drugDispenser` once this image is deployed.

### 2026-07-09 — RX corruption cracked: inverted line, 6-bit software recovery shipped

The "wire-level RX corruption" above is now fully characterized. Analysis of 15
captured TX/RX pairs from `events-serial.log` shows the RX line polarity is
**inverted** (A/B pair swap or TTL/RS232 polarity mismatch on the RX side of the
adapter — TX side is wired correctly, which is why commands execute). The
receiver locks 3 bit-times early on the inverted stream, producing a stable
per-byte transform:

```text
observed = ((~X & 0x3F) << 2) | 0b10        # X = true byte; bits 6-7 lost
```

Verified exact across commands 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0x35, 0x39 —
command byte, status/result codes, lift positions, and microswitch bitmaps all
recover correctly (vendor codes are < 0x40, so the 2 lost top bits don't matter
for decisions; lift pickup positions 0x55-0x57 alias to 0x15-0x17, compare with
`& 0x3F`; CRC is unverifiable in this mode).

`sy600.service.js` now auto-recovers these frames (`tryRecoverInvertedRx`) when
normal parsing fails: responses carry `recovered: true` + `recoveryNote`, and a
`sy600.rx.recovered` event is logged. Covered by `test/sy600.recovery.test.js`
using the real captured hex.

**The hardware fix is still the right fix** — swap/rewire the RX pair on the
serial adapter at the machine; recovery then becomes dead code that never
triggers (it only activates on the exact corruption signature).
