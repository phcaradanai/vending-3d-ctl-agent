import {
  SY600_DEVICE_ADDRESS_HEX,
  SY600_USE_CRC16,
} from "../config/env.js";
import { writeVendingSerialData } from "./serial.service.js";

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

function parseSy600FrameFromHex(responseHex) {
  const raw = Buffer.from(responseHex, "hex");
  if (raw.length < 11) {
    const error = new Error("Response too short for SY600 frame");
    error.status = 502;
    throw error;
  }
  const start = raw[0];
  const version = raw[1];
  const address = raw.subarray(2, 6);
  const command = raw[6];
  const length = raw.readUInt16BE(7);
  const expectedTotal = 1 + 1 + 4 + 1 + 2 + length + 2;
  if (raw.length < expectedTotal) {
    const error = new Error(`Incomplete SY600 frame: expected ${expectedTotal} bytes, got ${raw.length}`);
    error.status = 502;
    throw error;
  }
  const data = raw.subarray(9, 9 + length);
  const crcRead = raw.readUInt16LE(9 + length);

  if (start !== SY600_START_RX && start !== SY600_START_TX) {
    const error = new Error(`Unexpected frame start byte: 0x${toHex(start)}`);
    error.status = 502;
    throw error;
  }
  if (version !== SY600_VERSION) {
    const error = new Error(`Unexpected frame version: 0x${toHex(version)}`);
    error.status = 502;
    throw error;
  }

  if (SY600_USE_CRC16) {
    const checkTarget = raw.subarray(0, 9 + length);
    const crcExpected = crc16Modbus(checkTarget);
    if (crcExpected !== crcRead) {
      const error = new Error(
        `CRC mismatch: expected 0x${crcExpected.toString(16)}, got 0x${crcRead.toString(16)}`
      );
      error.status = 502;
      throw error;
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
    rawHex: raw.toString("hex").toUpperCase(),
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

async function sendSy600(command, dataBytes) {
  const frame = buildSy600Frame(command, dataBytes);
  const txHex = frame.toString("hex").toUpperCase();
  const writeResult = await writeVendingSerialData(txHex);
  const parsed = parseSy600FrameFromHex(writeResult.responseHex);
  return {
    txHex,
    response: decodeCommandResponse(parsed),
  };
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
    const result = await sendSy600(0xc4, dataBytes);
    attempts.push({
      attempt: index + 1,
      ...result,
    });
  }

  return {
    repeat: repeatCount,
    attempts,
    last: attempts[attempts.length - 1],
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
  return sendSy600(0x35, [ensureByte(sensorType, "sensorType"), 0x00]);
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
  const writeResult = await writeVendingSerialData(txHex);
  const parsed = parseSy600FrameFromHex(writeResult.responseHex);
  return {
    txHex,
    response: decodeCommandResponse(parsed),
  };
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
  const writeResult = await writeVendingSerialData(txHex);
  const parsed = parseSy600FrameFromHex(writeResult.responseHex);
  return {
    txHex,
    response: decodeCommandResponse(parsed),
  };
}

