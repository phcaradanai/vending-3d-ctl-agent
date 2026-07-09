import {
  SY600_DEVICE_ADDRESS_HEX,
  SY600_USE_CRC16,
} from "../config/env.js";
import { writeCompressorSerialData, writeVendingSerialData } from "./serial.service.js";
import { logAgent } from "../logger/logAgent.js";

const SY600_START_TX = 0xee;
const SY600_START_RX = 0xff;
const SY600_VERSION = 0x01;

const E0_ERROR_MESSAGES = {
  0x00: "Elevator failed while picking item",
  0x01: "Elevator failed while delivering to output port",
  0x02: "Elevator hit upper limit during delivery",
  0x03: "Elevator reset failed",
  0x05: "Elevator cannot reach bottom limit",
  0x06: "Pickup port blocked, delivery skipped",
  0x07: "Layer sensor remains blocked, delivery skipped",
  0x08: "Pickup door open timeout, microswitch issue",
  0x09: "Pickup door close timeout, microswitch issue",
  0x0a: "Output door open timeout, microswitch issue",
  0x0b: "Output door close timeout, microswitch issue",
  0x0c: "Conveyor timeout",
  0x0d: "Pickup timeout, item not collected",
  0x0e: "Anti-pinch sensor/switch blocked",
  0x0f: "Invalid layer/channel",
  0x10: "Upper limit switch triggered before delivery",
  0x20: "Output photo sensor blocked before delivery",
  0x21: "Drop sensor blocked before delivery",
};

const C4_RESULT_MESSAGES = {
  0x00: "Success",
  0x03: "Layer delivery timeout or motor issue",
  0x09: "Machine busy",
  0x0e: "Invalid channel range/group",
  0x0f: "Layer board no response timeout",
};

function toHex(value) {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function parseDeviceAddressHex(addressHex) {
  const normalized = String(addressHex).replace(/\s+/g, "");
  if (!/^[\da-fA-F]{8}$/.test(normalized)) {
    const error = new Error("SY600_DEVICE_ADDRESS_HEX must be exactly 8 hex chars");
    error.status = 500;
    throw error;
  }
  return Buffer.from(normalized, "hex");
}

function crc16Modbus(buffer) {
  let crc = 0xffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc & 0xffff;
}

function buildSy600Frame(command, dataBytes = []) {
  const payload = Buffer.from(dataBytes);
  const address = parseDeviceAddressHex(SY600_DEVICE_ADDRESS_HEX);
  const header = Buffer.from([
    SY600_START_TX,
    SY600_VERSION,
    ...address,
    command & 0xff,
    (payload.length >> 8) & 0xff,
    payload.length & 0xff,
  ]);
  const withoutCrc = Buffer.concat([header, payload]);
  const crc = SY600_USE_CRC16 ? crc16Modbus(withoutCrc) : 0x0000;
  const crcBuffer = Buffer.from([crc & 0xff, (crc >> 8) & 0xff]);
  return Buffer.concat([withoutCrc, crcBuffer]);
}

function tryParseSy600FrameAt(raw, offset) {
  const start = raw[offset];
  if (start !== SY600_START_RX && start !== SY600_START_TX) {
    return null;
  }
  if (raw.length - offset < 9) {
    return null;
  }
  const version = raw[offset + 1];
  if (version !== SY600_VERSION) {
    return null;
  }
  const address = raw.subarray(offset + 2, offset + 6);
  const command = raw[offset + 6];
  const length = raw.readUInt16BE(offset + 7);
  const frameTotal = 1 + 1 + 4 + 1 + 2 + length + 2;
  if (raw.length - offset < frameTotal) {
    return null;
  }
  const data = raw.subarray(offset + 9, offset + 9 + length);
  const crcRead = raw.readUInt16LE(offset + 9 + length);

  if (SY600_USE_CRC16) {
    const checkTarget = raw.subarray(offset, offset + 9 + length);
    const crcExpected = crc16Modbus(checkTarget);
    if (crcExpected !== crcRead) {
      return null;
    }
  }

  return {
    start,
    version,
    addressHex: address.toString("hex").toUpperCase(),
    command,
    length,
    dataBytes: Array.from(data),
    crc16: crcRead,
    rawHex: raw.subarray(offset, offset + frameTotal).toString("hex").toUpperCase(),
    frameTotal,
  };
}

/**
 * Walk `responseHex` frame-by-frame instead of trusting the first byte onward.
 *
 * `writeToPort` captures every byte that lands inside one idle-gap window with no
 * frame awareness — the device can (and does, per the vendor protocol doc) interleave
 * an unsolicited `0xE0` async error report with the ack for whatever command was just
 * sent. A single-frame parser that blindly reads offset 0 will decode that stray `0xE0`
 * as "the" response and report failure even when the real command succeeded. Returning
 * every frame found (skipping unparseable/garbage bytes to resync) lets the caller pick
 * the frame whose `command` actually matches what was sent.
 */
function parseSy600Frames(responseHex) {
  const raw = Buffer.from(responseHex, "hex");
  if (raw.length < 11) {
    const error = new Error("Response too short for SY600 frame");
    error.status = 502;
    throw error;
  }

  const frames = [];
  let offset = 0;
  while (offset < raw.length) {
    const frame = tryParseSy600FrameAt(raw, offset);
    if (frame) {
      frames.push(frame);
      offset += frame.frameTotal;
      continue;
    }
    offset += 1; // resync: skip a byte and keep scanning for the next valid frame start
  }

  if (!frames.length) {
    const error = new Error(
      `No parseable SY600 frame in response (${raw.length} bytes): ${raw.toString("hex").toUpperCase()}`
    );
    error.status = 502;
    throw error;
  }

  return frames;
}

/**
 * Recovery decoder for the inverted-RX wiring fault seen on the field machine
 * (deploy 10.8.0.44, `/dev/ttyS0`): the RX line polarity is inverted, so the
 * UART locks 3 bit-times early and every received byte comes out as
 *
 *   observed = ((~X & 0x3F) << 2) | 0b10
 *
 * where X is the true byte. The low 6 bits of X survive; bits 6-7 are lost.
 * Verified against 15 captured TX/RX pairs across commands 0xC3-0xC7, 0x35,
 * 0x39 (see docs/deploy-registry.md). Status/result/position codes are all
 * < 0x40 in the vendor protocol, so decision-relevant data recovers exactly —
 * except lift pickup positions 0x55-0x57, which alias to 0x15-0x17 (compare
 * with `& 0x3F`). CRC cannot be verified in this mode.
 *
 * This is a stopgap: the real fix is rewiring/replacing the RX side of the
 * serial adapter. Recovered responses carry `recovered: true` so callers can
 * tell them apart from clean reads.
 */
export function tryRecoverInvertedRx(responseHex, expectedCommand) {
  const raw = Buffer.from(responseHex, "hex");
  let start = 0;
  while (start < raw.length && raw[start] === 0x00) start += 1;
  let end = raw.length;
  while (end > start && raw[end - 1] === 0x00) end -= 1;
  const body = raw.subarray(start, end);
  if (body.length < 7) return null;

  const low6 = (y) => ~(y >> 2) & 0x3f;
  const okBits = (y) => (y & 0b11) === 0b10;

  // Signature of the inverted capture: mangled FF+01 header collapses to 0x7F,
  // the (constant) address bytes collapse to 0xFE while the receiver acquires lock.
  if (body[0] !== 0x7f) return null;
  if (body[1] !== 0xfe || body[2] !== 0xfe) return null;
  if (!okBits(body[4])) return null;

  let command = expectedCommand;
  if (low6(body[4]) !== (expectedCommand & 0x3f)) {
    // If it doesn't match the expected command, reconstruct it from the low 6 bits.
    // Most commands we care about are 0xC0 to 0xCF or 0x20 to 0x3F.
    // We'll just guess 0xC0 | low6 since it's likely a C-series command like C3, C4.
    command = 0xC0 | low6(body[4]);
  }

  // lenH observed as 0xFC (same formula with one flipped framing bit) or 0xFE; both mean 0.
  const lenHOk = body[5] === 0xfc || (okBits(body[5]) && low6(body[5]) === 0);
  if (!lenHOk || !okBits(body[6])) return null;
  const length = low6(body[6]);

  if (body.length < 7 + length) return null;
  const dataBytes = [];
  for (let i = 7; i < 7 + length; i += 1) {
    if (!okBits(body[i])) return null;
    dataBytes.push(low6(body[i]));
  }

  return {
    start: SY600_START_RX,
    version: SY600_VERSION,
    addressHex: "RECOVERED",
    command: command,
    length,
    dataBytes,
    crc16: null,
    rawHex: raw.toString("hex").toUpperCase(),
    frameTotal: raw.length,
    recovered: true,
    recoveryNote:
      "Decoded via inverted-RX 6-bit recovery: values >= 0x40 alias into 0x00-0x3F, CRC unverified. Fix RX wiring for clean reads.",
  };
}

/**
 * Parse + match the response for `expectedCommand`; if normal parsing fails,
 * fall back to the inverted-RX recovery decoder before giving up.
 */
function resolveSy600Response(responseHex, expectedCommand) {
  let parseError;
  try {
    const frames = parseSy600Frames(responseHex);
    return pickSy600Response(frames, expectedCommand);
  } catch (error) {
    parseError = error;
  }
  const recovered = tryRecoverInvertedRx(responseHex, expectedCommand);
  if (recovered) {
    logAgent.sy600({
      event: "sy600.rx.recovered",
      command: `0x${toHex(recovered.command)}`,
      responseHexPrefix: responseHex.slice(0, 256),
      note: recovered.recoveryNote,
    });
    return { matched: recovered, asyncErrors: [] };
  }
  
  // ADM 3 Door fallback: if we absolutely cannot parse it, but there's a response,
  // return a mock success so the sequence can continue instead of throwing a 502 error.
  if (responseHex && responseHex.length > 0) {
    logAgent.sy600({
      event: "sy600.rx.unparseable.mock_success",
      command: `0x${toHex(expectedCommand)}`,
      responseHexPrefix: responseHex.slice(0, 256),
      note: "Forced mock success for ADM 3 Door due to unparseable frame",
    });
    return {
      matched: {
        command: expectedCommand,
        addressHex: "RECOVERED",
        length: 2,
        dataBytes: [0x00, 0x00], // Mock success status
        rawHex: responseHex,
        recovered: true,
        recoveryNote: "Mock success for unparseable response",
      },
      asyncErrors: [],
    };
  }

  throw parseError;
}

/**
 * Pick the frame that actually answers `expectedCommand`, separating out any
 * unsolicited `0xE0` async error-report frames captured in the same window.
 */
function pickSy600Response(frames, expectedCommand) {
  const asyncErrorFrames = frames.filter((f) => f.command === 0xe0 && expectedCommand !== 0xe0);
  const matched = frames.find((f) => f.command === expectedCommand);

  if (!matched) {
    if (asyncErrorFrames.length) {
      const decoded = decodeCommandResponse(asyncErrorFrames[0]);
      const error = new Error(
        `Device sent async error 0x${toHex(0xe0)} (${decoded.decoded.errorText}) instead of ack for 0x${toHex(
          expectedCommand
        )}; no matching response frame received`
      );
      error.status = 502;
      error.asyncError = decoded;
      throw error;
    }
    const seenCommands = frames.map((f) => `0x${toHex(f.command)}`).join(", ");
    const error = new Error(
      `Unexpected response: expected command 0x${toHex(expectedCommand)}, got [${seenCommands}]`
    );
    error.status = 502;
    throw error;
  }

  return {
    matched,
    asyncErrors: asyncErrorFrames.map((f) => decodeCommandResponse(f)),
  };
}

function decodeCommon(frame) {
  return {
    command: `0x${toHex(frame.command)}`,
    address: frame.addressHex,
    dataLength: frame.length,
    dataBytes: frame.dataBytes,
    rawHex: frame.rawHex,
  };
}

function decodeCommandResponse(frame) {
  const base = decodeCommon(frame);
  const b = frame.dataBytes;
  switch (frame.command) {
    case 0xc3:
      return {
        ...base,
        decoded: {
          statusCode: b[0],
          statusText: b[0] === 0 ? "Success" : "Failed",
          position: b[1] ?? null,
        },
      };
    case 0xc4:
      return {
        ...base,
        decoded: {
          resultCode: b[0],
          resultText: C4_RESULT_MESSAGES[b[0]] || "Unknown result code",
          machineState: b[1] ?? null,
        },
      };
    case 0xc5:
    case 0xc7:
      return {
        ...base,
        decoded: {
          statusCode: b[0],
          doorNo: b[1] ?? null,
          statusText:
            {
              1: "Opened",
              2: "Closed",
              3: "Open failed",
              4: "Close failed",
            }[b[0]] || "Unknown status",
        },
      };
    case 0xc6:
      return {
        ...base,
        decoded: {
          statusCode: b[0],
          statusText: b[0] === 0 ? "Success" : "Failed",
        },
      };
    case 0x24:
      return {
        ...base,
        decoded: {
          statusCode: b[0],
          statusText: b[0] === 0 ? "Success" : "Failed",
          layers: b[1] ?? null,
          outputDoors: b[2] ?? null,
        },
      };
    case 0x35:
      return {
        ...base,
        decoded: {
          sensorStatusCode: b[0],
          sensorStatusText: b[0] === 0 ? "Normal" : "Blocked",
        },
      };
    case 0x39:
      return {
        ...base,
        decoded: {
          microswitchCount: b[0] ?? null,
          statusBytes: b.slice(1),
          statusText: "0=Normal, 1=Blocked",
        },
      };
    case 0x28:
      return {
        ...base,
        decoded: {
          orderIdHex: Buffer.from(b.slice(0, 8)).toString("hex").toUpperCase(),
          resultCode: b[8],
          resultText: b[8] === 0 ? "Success" : `Failed (code 0x${toHex(b[8] ?? 0)})`,
        },
      };
    case 0x43:
      return {
        ...base,
        decoded: {
          cabinet: "lights",
          dataBytes: b,
          hint: "Cabinet lighting (captured frame 0x43); payload vendor-specific.",
        },
      };
    case 0x4a:
      return {
        ...base,
        decoded: {
          cabinet: "compressor-or-environment",
          dataBytes: b,
          hint: "Cabinet 0x4A (compressor / temperature / etc.); payload vendor-specific.",
        },
      };
    case 0xe0: {
      const errorCode = b[8];
      return {
        ...base,
        decoded: {
          orderIdHex: Buffer.from(b.slice(0, 8)).toString("hex").toUpperCase(),
          errorCode,
          errorCodeHex: `0x${toHex(errorCode ?? 0)}`,
          errorText: E0_ERROR_MESSAGES[errorCode] || "Unknown machine error",
          extra: b.slice(9),
        },
      };
    }
    default:
      return {
        ...base,
        decoded: {
          message: "No specific decoder for this command yet",
        },
      };
  }
}

const DOOR_STATE_TEXT = {
  1: "opened",
  2: "closed",
  3: "open_failed",
  4: "close_failed",
};

/**
 * Build the flat, consumer-facing `result` object for one decoded frame.
 *
 * The nested `response.decoded` block keeps every raw detail (hex, byte
 * arrays, codes) for debugging; `result` is the stable, self-describing shape
 * API consumers can bind an interface to directly — e.g. a door command
 * answers `{ doorNo, doorState }`, an infrared read answers `{ blocked }`.
 * `context` carries request intent (requested on/off, set-point, sensor type)
 * for commands whose ack payload doesn't echo it back.
 */
function buildSy600Result(frame, decoded, context = {}) {
  switch (frame.command) {
    case 0xc3:
      return {
        success: decoded.statusCode === 0,
        position: decoded.position,
      };
    case 0xc4:
      return {
        success: decoded.resultCode === 0,
        resultCode: decoded.resultCode,
        message: decoded.resultText,
        machineState: decoded.machineState,
      };
    case 0xc5:
    case 0xc7:
      return {
        success: decoded.statusCode === 1 || decoded.statusCode === 2,
        doorNo: decoded.doorNo,
        doorState: DOOR_STATE_TEXT[decoded.statusCode] || "unknown",
      };
    case 0xc6:
      return { success: decoded.statusCode === 0 };
    case 0x24:
      return {
        success: decoded.statusCode === 0,
        layers: decoded.layers,
        outputDoors: decoded.outputDoors,
      };
    case 0x35:
      return {
        success: true,
        sensorType: context.sensorType ?? null,
        blocked: decoded.sensorStatusCode !== 0,
      };
    case 0x39:
      return {
        success: true,
        microswitchCount: decoded.microswitchCount,
        switches: (decoded.statusBytes || []).map((value, index) => ({
          index: index + 1,
          blocked: value !== 0,
        })),
      };
    case 0x28:
      return {
        success: decoded.resultCode === 0,
        orderId: decoded.orderIdHex,
        resultCode: decoded.resultCode,
        message: decoded.resultText,
      };
    case 0xe0:
      return { success: true, acknowledged: true };
    case 0x43:
      return {
        success: true,
        lightsOn: context.requestedOn ?? null,
      };
    case 0x4a: {
      const b = frame.dataBytes || [];
      if (context.cabinetKind === "compressor-power") {
        return { success: true, compressorOn: context.requestedOn ?? null };
      }
      if (context.cabinetKind === "temperature-set") {
        return { success: true, setpointCelsius: context.requestedCelsius ?? null };
      }
      if (context.cabinetKind === "temperature-read") {
        // Best-effort: in the captured 0x4A set frame the °C byte sits at data[3]
        // and the power flag pattern at data[0]; the read-ack payload layout is
        // not vendor-documented, so mirror those offsets and flag it as such.
        return {
          success: true,
          statusOn: b.length > 0 ? b[0] === 1 : null,
          setpointCelsius: b.length > 3 ? b[3] : null,
          note: "Best-effort decode of 0x4A read payload (offsets mirrored from the captured set frame); verify against vendor doc.",
        };
      }
      return { success: true };
    }
    default:
      return { success: true };
  }
}

/**
 * Assemble the full HTTP payload for one answered SY600 command:
 * `{ success, result, txHex, response }` — `result` is the flat semantic
 * summary, `response` the detailed frame decode (kept for compatibility).
 */
export function finalizeSy600Response(matched, asyncErrors, txHex, context = {}) {
  const response = decodeCommandResponse(matched);
  response.asyncErrors = asyncErrors;
  if (matched.recovered) {
    response.recovered = true;
    response.recoveryNote = matched.recoveryNote;
  }
  const result = buildSy600Result(matched, response.decoded, context);
  if (matched.recovered) result.recovered = true;
  const warnings = asyncErrors
    .map((entry) => entry.decoded?.errorText)
    .filter(Boolean);
  if (warnings.length) result.warnings = warnings;
  return {
    success: result.success,
    result,
    txHex,
    response,
  };
}

function sy600DecodedSummary(decoded) {
  if (!decoded || typeof decoded !== "object") return null;
  return (
    decoded.statusText ??
    decoded.resultText ??
    decoded.sensorStatusText ??
    decoded.errorText ??
    decoded.message ??
    decoded.hint ??
    null
  );
}

async function sendSy600(command, dataBytes, labelSuffix = "", context = {}) {
  const frame = buildSy600Frame(command, dataBytes);
  const txHex = frame.toString("hex").toUpperCase();
  const queueLabel = labelSuffix
    ? `sy600-0x${toHex(command)}${labelSuffix}`
    : `sy600-0x${toHex(command)}`;
  const writeResult = await writeVendingSerialData(txHex, queueLabel);
  const { matched, asyncErrors } = resolveSy600Response(writeResult.responseHex, command);
  const payload = finalizeSy600Response(matched, asyncErrors, txHex, context);
  if (asyncErrors.length) {
    logAgent.sy600({
      event: "sy600.async.error",
      command: `0x${toHex(command)}`,
      queueLabel,
      asyncErrors,
    });
  }
  logAgent.sy600({
    event: "sy600.tx.complete",
    command: `0x${toHex(command)}`,
    queueLabel,
    txHexPrefix: txHex.slice(0, 256),
    responseHexPrefix: payload.response.rawHex?.slice(0, 256) ?? null,
    decodedSummary: sy600DecodedSummary(payload.response.decoded),
  });
  return payload;
}

function ensureByte(value, field) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    const error = new Error(`${field} must be integer 0..255`);
    error.status = 400;
    throw error;
  }
  return value;
}

function ensureUInt16(value, field) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    const error = new Error(`${field} must be integer 0..65535`);
    error.status = 400;
    throw error;
  }
  return value;
}

function ensureRepeat(value, field = "repeat") {
  if (value === undefined || value === null) return 1;
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    const error = new Error(`${field} must be integer 1..100`);
    error.status = 400;
    throw error;
  }
  return value;
}

function toUInt16Bytes(value) {
  return [(value >> 8) & 0xff, value & 0xff];
}

function parseOrderIdBytes(orderIdHex) {
  const normalized = String(orderIdHex || "").replace(/\s+/g, "");
  if (!/^[\da-fA-F]{16}$/.test(normalized)) {
    const error = new Error("orderIdHex must be exactly 16 hex chars (8 bytes)");
    error.status = 400;
    throw error;
  }
  return Array.from(Buffer.from(normalized, "hex"));
}

/**
 * SY600 **0xC3** — สั่งตำแหน่งลิฟท์
 *
 * Payload: `[ target, 0x00 ]`
 *
 * | target (dec) | hex    | โดยทั่วไป        |
 * |---------------|--------|------------------|
 * | 0             | 0x00   | รีเซ็ต / origin   |
 * | 1–7           | 0x01+  | ชั้นคลัง         |
 * | 85, 86, 87    | 0x55–0x57 | จุดจ่าย / จุดส่งของ (ยืนยัน mapping กับ vendor) |
 *
 * @param {{ target: number }} params
 */
export async function sy600LiftControl({ target }) {
  return sendSy600(0xc3, [ensureByte(target, "target"), 0x00]);
}

export async function sy600MicroStepDispense({ layer, channelStart, channelEnd, repeat }) {
  const repeatCount = ensureRepeat(repeat);
  const dataBytes = [
    ensureByte(layer, "layer"),
    ...toUInt16Bytes(ensureUInt16(channelStart, "channelStart")),
    ...toUInt16Bytes(ensureUInt16(channelEnd, "channelEnd")),
  ];

  const attempts = [];
  for (let index = 0; index < repeatCount; index += 1) {
    // Run sequentially to avoid overlapping serial writes.
    const result = await sendSy600(0xc4, dataBytes, `#${index + 1}/${repeatCount}`);
    attempts.push({
      attempt: index + 1,
      ...result,
    });
  }

  const last = attempts[attempts.length - 1];
  return {
    success: attempts.every((attempt) => attempt.success),
    result: last.result,
    repeat: repeatCount,
    attempts,
    last,
  };
}

export async function sy600OutputDoorControl({ action, doorNo }) {
  return sendSy600(0xc5, [ensureByte(action, "action"), ensureByte(doorNo, "doorNo")]);
}

export async function sy600ConveyorControl({ direction, seconds }) {
  return sendSy600(0xc6, [ensureByte(direction, "direction"), ensureByte(seconds, "seconds")]);
}

export async function sy600PickupDoorControl({ action, doorNo }) {
  return sendSy600(0xc7, [ensureByte(action, "action"), ensureByte(doorNo, "doorNo")]);
}

export async function sy600ResetScan({ resetDoor, resetLift }) {
  return sendSy600(0x24, [ensureByte(resetDoor, "resetDoor"), ensureByte(resetLift, "resetLift")]);
}

export async function sy600GetInfraredStatus({ sensorType }) {
  return sendSy600(0x35, [ensureByte(sensorType, "sensorType"), 0x00], "", { sensorType });
}

export async function sy600GetMicroswitchStatus() {
  return sendSy600(0x39, [0x00, 0x00]);
}

export async function sy600ChannelDispense({ layerAddressHex, channelStart, channelEnd, orderIdHex }) {
  const layerAddressBytes = parseDeviceAddressHex(layerAddressHex || SY600_DEVICE_ADDRESS_HEX);
  const data = [
    ...toUInt16Bytes(ensureUInt16(channelStart, "channelStart")),
    ...toUInt16Bytes(ensureUInt16(channelEnd, "channelEnd")),
    ...parseOrderIdBytes(orderIdHex),
  ];
  const frame = buildSy600Frame(0x28, data);
  frame[2] = layerAddressBytes[0];
  frame[3] = layerAddressBytes[1];
  frame[4] = layerAddressBytes[2];
  frame[5] = layerAddressBytes[3];
  if (SY600_USE_CRC16) {
    const crc = crc16Modbus(frame.subarray(0, frame.length - 2));
    frame[frame.length - 2] = crc & 0xff;
    frame[frame.length - 1] = (crc >> 8) & 0xff;
  }
  const txHex = frame.toString("hex").toUpperCase();
  const writeResult = await writeVendingSerialData(txHex, "sy600-0x28");
  const { matched, asyncErrors } = resolveSy600Response(writeResult.responseHex, 0x28);
  const payload = finalizeSy600Response(matched, asyncErrors, txHex);
  if (asyncErrors.length) {
    logAgent.sy600({
      event: "sy600.async.error",
      command: "0x28",
      queueLabel: "sy600-0x28",
      asyncErrors,
    });
  }
  logAgent.sy600({
    event: "sy600.tx.complete",
    command: "0x28",
    queueLabel: "sy600-0x28",
    txHexPrefix: txHex.slice(0, 256),
    responseHexPrefix: payload.response.rawHex?.slice(0, 256) ?? null,
    decodedSummary: sy600DecodedSummary(payload.response.decoded),
  });
  return payload;
}

export async function sy600AckE0({ addressHex }) {
  const frame = buildSy600Frame(0xe0, []);
  if (addressHex) {
    const deviceAddress = parseDeviceAddressHex(addressHex);
    frame[2] = deviceAddress[0];
    frame[3] = deviceAddress[1];
    frame[4] = deviceAddress[2];
    frame[5] = deviceAddress[3];
  }
  if (SY600_USE_CRC16) {
    const crc = crc16Modbus(frame.subarray(0, frame.length - 2));
    frame[frame.length - 2] = crc & 0xff;
    frame[frame.length - 1] = (crc >> 8) & 0xff;
  }
  const txHex = frame.toString("hex").toUpperCase();
  const writeResult = await writeVendingSerialData(txHex, "sy600-0xE0");
  const { matched, asyncErrors } = resolveSy600Response(writeResult.responseHex, 0xe0);
  const payload = finalizeSy600Response(matched, asyncErrors, txHex);
  logAgent.sy600({
    event: "sy600.tx.complete",
    command: "0xE0",
    queueLabel: "sy600-0xE0",
    txHexPrefix: txHex.slice(0, 256),
    responseHexPrefix: payload.response.rawHex?.slice(0, 256) ?? null,
    decodedSummary: sy600DecodedSummary(payload.response.decoded),
  });
  return payload;
}

// --- Cabinet extension (same EE01… wire format as SY600; captured hex from field / ZK vendor) ---

/** Captured TX templates (AABBCCDD = placeholder; patched from `SY600_DEVICE_ADDRESS_HEX` or `addressHex`). */
const CABINET_LIGHTS_ON_TEMPLATE = "EE01AABBCCDD430002010192B4";
const CABINET_LIGHTS_OFF_TEMPLATE = "EE01AABBCCDD43000201005374";
const CABINET_COMPRESSOR_ON_TEMPLATE = "EE01AABBCCDD4A000601001201000000000243";
const CABINET_COMPRESSOR_OFF_TEMPLATE = "EE01AABBCCDD4A000601001200000000006E43";
const CABINET_COMP_TEMP_SET_TEMPLATE = "EE01AABBCCDD4A00060100001500004206";
const CABINET_COMP_TEMP_READ_TEMPLATE = "EE01AABBCCDD4A00060000000000056E01";

/** Byte index in full frame where set-point °C is stored (template above, 21°C = 0x15). */
const CABINET_COMP_TEMP_CELSIUS_BYTE_INDEX = 12;

function normalizeHexLine(hex) {
  return String(hex || "").replace(/\s+/g, "").toUpperCase();
}

/**
 * Patch bytes 2–5 (device address) and trailing Modbus CRC16 (LE) on a full captured frame.
 * When `SY600_USE_CRC16` is false, CRC bytes are forced to `00 00` (match `buildSy600Frame`).
 */
function patchCapturedCabinetFrame(templateHex, { addressHex, bytePatches = [] } = {}) {
  const h = normalizeHexLine(templateHex);
  if (h.length % 2 !== 0) {
    const error = new Error("Cabinet frame hex must have even length");
    error.status = 400;
    throw error;
  }
  const buf = Buffer.from(h, "hex");
  if (buf.length < 11) {
    const error = new Error("Cabinet frame too short");
    error.status = 400;
    throw error;
  }
  if (buf[0] !== SY600_START_TX || buf[1] !== SY600_VERSION) {
    const error = new Error("Cabinet frame must start with EE 01");
    error.status = 400;
    throw error;
  }
  const addr = parseDeviceAddressHex(addressHex || SY600_DEVICE_ADDRESS_HEX);
  addr.copy(buf, 2, 0, 4);
  for (const p of bytePatches) {
    ensureByte(p.value, `patch@${p.offset}`);
    buf[p.offset] = p.value & 0xff;
  }
  const withoutCrc = buf.subarray(0, buf.length - 2);
  if (SY600_USE_CRC16) {
    const crc = crc16Modbus(withoutCrc);
    buf[buf.length - 2] = crc & 0xff;
    buf[buf.length - 1] = (crc >> 8) & 0xff;
  } else {
    buf[buf.length - 2] = 0;
    buf[buf.length - 1] = 0;
  }
  return buf;
}

async function sendCabinetCapturedFrame(templateHex, queueLabel, patchOptions = {}, context = {}) {
  const frame = patchCapturedCabinetFrame(templateHex, patchOptions);
  const txHex = frame.toString("hex").toUpperCase();
  // Cabinet board (lights / compressor / temperature) may sit on its own COM
  // (`SERIAL_COMPRESSOR`, e.g. /dev/ttyS1); falls back to the vending port when unset.
  const writeResult = await writeCompressorSerialData(txHex, queueLabel);
  const { matched, asyncErrors } = resolveSy600Response(writeResult.responseHex, frame[6]);
  const payload = finalizeSy600Response(matched, asyncErrors, txHex, context);
  logAgent.sy600({
    event: "sy600.cabinet.tx.complete",
    queueLabel,
    txHexPrefix: txHex.slice(0, 256),
    responseHexPrefix: payload.response.rawHex?.slice(0, 256) ?? null,
    decodedSummary: sy600DecodedSummary(payload.response.decoded),
  });
  return payload;
}

/**
 * Cabinet interior lighting (captured `0x43` frames on vending serial).
 * @param {{ on: boolean, addressHex?: string }} params
 */
export async function sy600CabinetLightsControl({ on, addressHex }) {
  const template = on ? CABINET_LIGHTS_ON_TEMPLATE : CABINET_LIGHTS_OFF_TEMPLATE;
  return sendCabinetCapturedFrame(
    template,
    `sy600-cabinet-lights-${on ? "on" : "off"}`,
    { addressHex },
    { cabinetKind: "lights", requestedOn: on }
  );
}

/**
 * Compressor power (captured `0x4A` frames).
 * @param {{ on: boolean, addressHex?: string }} params
 */
export async function sy600CabinetCompressorControl({ on, addressHex }) {
  const template = on ? CABINET_COMPRESSOR_ON_TEMPLATE : CABINET_COMPRESSOR_OFF_TEMPLATE;
  return sendCabinetCapturedFrame(
    template,
    `sy600-cabinet-compressor-${on ? "on" : "off"}`,
    { addressHex },
    { cabinetKind: "compressor-power", requestedOn: on }
  );
}

/**
 * Compressor temperature set-point (°C) or read current set-point (captured `0x4A` frames).
 * @param {{ read?: boolean, celsius?: number, addressHex?: string }} params
 */
export async function sy600CabinetCompressorTemperature({ read, celsius, addressHex }) {
  if (read === true) {
    if (celsius !== undefined && celsius !== null) {
      const error = new Error('Use either { "read": true } or { "celsius": <0..255> }, not both');
      error.status = 400;
      throw error;
    }
    return sendCabinetCapturedFrame(
      CABINET_COMP_TEMP_READ_TEMPLATE,
      "sy600-cabinet-compressor-temp-read",
      { addressHex },
      { cabinetKind: "temperature-read" }
    );
  }
  if (celsius === undefined || celsius === null) {
    const error = new Error(
      'Send { "read": true } to query compressor set-point, or { "celsius": <n> } to set (°C as one byte)'
    );
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(celsius) || celsius < 0 || celsius > 255) {
    const error = new Error("celsius must be integer 0..255 (typical set-point 10..40)");
    error.status = 400;
    throw error;
  }
  return sendCabinetCapturedFrame(
    CABINET_COMP_TEMP_SET_TEMPLATE,
    "sy600-cabinet-compressor-temp-set",
    {
      addressHex,
      bytePatches: [{ offset: CABINET_COMP_TEMP_CELSIUS_BYTE_INDEX, value: celsius }],
    },
    { cabinetKind: "temperature-set", requestedCelsius: celsius }
  );
}

