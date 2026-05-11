import { SerialPort } from "serialport";
import {
  SERIAL_NAVIGATION_LIGHTS,
  SERIAL_NAVIGATION_LIGHTS_BAUD_RATE,
  SERIAL_QR_NFC,
  SERIAL_QR_NFC_BAUD_RATE,
  SERIAL_NAVIGATION_LIGHTS_FRAME_DEBUG,
  SERIAL_VENDING,
  SERIAL_VENDING_BAUD_RATE,
  SERIAL_WRITE_DEBUG,
  SERIAL_WRITE_TIMEOUT_MS,
} from "../config/env.js";
import { publishQrNfcPayload } from "./mqtt.service.js";


let vendingSerialPort;
let navigationLightsSerialPort;
let qrNfcSerialPort;
let vendingReconnectTimer;
let navigationReconnectTimer;
let qrNfcReconnectTimer;
let vendingLastError;
let navigationLastError;
let qrNfcLastError;
let vendingLastConnectedAt;
let navigationLastConnectedAt;
let qrNfcLastConnectedAt;
let vendingLastWriteAt;
let navigationLastWriteAt;
let qrNfcFrameBuffer = Buffer.alloc(0);
let qrNfcFrameTimer;
let navigationFrameBuffer = Buffer.alloc(0);
let navigationFrameTimer;
const QR_NFC_FRAME_IDLE_MS = 80;
const NAVIGATION_FRAME_IDLE_MS = 80;

// Create/open a port lazily and reuse the same instance.
async function getPort(currentPort, path, baudRate) {
  if (!currentPort || !currentPort.isOpen) {
    const nextPort = new SerialPort({
      path,
      baudRate,
      autoOpen: false,
    });

    await new Promise((resolve, reject) => {
      nextPort.open((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    return nextPort;
  }

  return currentPort;
}

function logSerialData(channel, chunk) {
  const payload = chunk.toString("utf8");
  // console.log(`[serial:${channel}] rx -> ${payload}`);
  // console.log(`[serial:${channel}] rx [buffer] ->`, Array.from(chunk));

  // if (channel === "qr-nfc") {
  //   console.log(`[serial:${channel}] publish to mqtt`);
  //   publishQrNfcPayload({
  //     payloadText: payload,
  //     payloadBytes: Array.from(chunk),
  //     portPath: qrNfcSerialPort?.path || SERIAL_QR_NFC,
  //   }).catch((error) => {
  //     console.error(`[mqtt] publish failed for qr-nfc: ${error.message}`);
  //   });
  // }
  return [payload, Array.from(chunk)];  // return payload and buffer to caller
}

function flushQrNfcFrame(buffer) {
  if (!buffer.length) return;
  const payload = buffer.toString("utf8").trim();
  if (!payload) return;

  console.log(`[serial:qr-nfc] payload -> ${payload}`);
  console.log(`[serial:qr-nfc] Buffer ->`, Array.from(buffer));
  publishQrNfcPayload({
    payloadText: payload,
    payloadBytes: Array.from(buffer),
    portPath: qrNfcSerialPort?.path || SERIAL_QR_NFC,
  }).catch((error) => {
    console.error(`[mqtt] publish failed for qr-nfc: ${error.message}`);
  });
}

function handleQrNfcChunk(chunk) {
  qrNfcFrameBuffer = Buffer.concat([qrNfcFrameBuffer, chunk]);

  // Preferred framing: newline-delimited records from scanner.
  let newlineIndex = qrNfcFrameBuffer.indexOf(0x0a);
  while (newlineIndex !== -1) {
    const frame = qrNfcFrameBuffer.subarray(0, newlineIndex).subarray(
      0,
      qrNfcFrameBuffer[newlineIndex - 1] === 0x0d ? newlineIndex - 1 : newlineIndex
    );
    flushQrNfcFrame(frame);
    qrNfcFrameBuffer = qrNfcFrameBuffer.subarray(newlineIndex + 1);
    newlineIndex = qrNfcFrameBuffer.indexOf(0x0a);
  }

  // Fallback framing: treat silence gap as end-of-frame.
  if (qrNfcFrameTimer) clearTimeout(qrNfcFrameTimer);
  qrNfcFrameTimer = setTimeout(() => {
    flushQrNfcFrame(qrNfcFrameBuffer);
    qrNfcFrameBuffer = Buffer.alloc(0);
    qrNfcFrameTimer = undefined;
  }, QR_NFC_FRAME_IDLE_MS);
}

function flushNavigationLightsFrame(buffer) {
  if (!buffer.length) return;
  const payload = buffer.toString("utf8").trim();
  if (!payload) return;

  if (!SERIAL_NAVIGATION_LIGHTS_FRAME_DEBUG) return;
  console.log(`[serial:navigation-lights] payload -> ${payload}`);
  // console.log(`[serial:navigation-lights] Buffer ->`, Array.from(buffer));
}

function handleNavigationLightsChunk(chunk) {
  navigationFrameBuffer = Buffer.concat([navigationFrameBuffer, chunk]);

  // Preferred framing: newline-delimited records.
  let newlineIndex = navigationFrameBuffer.indexOf(0x0a);
  while (newlineIndex !== -1) {
    const frame = navigationFrameBuffer.subarray(0, newlineIndex).subarray(
      0,
      navigationFrameBuffer[newlineIndex - 1] === 0x0d
        ? newlineIndex - 1
        : newlineIndex
    );
    flushNavigationLightsFrame(frame);
    navigationFrameBuffer = navigationFrameBuffer.subarray(newlineIndex + 1);
    newlineIndex = navigationFrameBuffer.indexOf(0x0a);
  }

  // Fallback framing: treat silence gap as end-of-frame.
  if (navigationFrameTimer) clearTimeout(navigationFrameTimer);
  navigationFrameTimer = setTimeout(() => {
    flushNavigationLightsFrame(navigationFrameBuffer);
    navigationFrameBuffer = Buffer.alloc(0);
    navigationFrameTimer = undefined;
  }, NAVIGATION_FRAME_IDLE_MS);
}

function scheduleReconnect(channel, connectFn, timerRefName) {
  if (timerRefName === "vending" && vendingReconnectTimer) {
    return;
  }

  if (timerRefName === "navigation" && navigationReconnectTimer) {
    return;
  }
  if (timerRefName === "qrNfc" && qrNfcReconnectTimer) {
    return;
  }

  // Keep reconnecting in background when cable/device is temporarily unavailable.
  const timer = setTimeout(async () => {
    try {
      await connectFn();
    } finally {
      if (timerRefName === "vending") {
        vendingReconnectTimer = undefined;
      } else if (timerRefName === "navigation") {
        navigationReconnectTimer = undefined;
      } else {
        qrNfcReconnectTimer = undefined;
      }
    }
  }, 2000);

  if (timerRefName === "vending") {
    vendingReconnectTimer = timer;
  } else if (timerRefName === "navigation") {
    navigationReconnectTimer = timer;
  } else {
    qrNfcReconnectTimer = timer;
  }
}

async function connectVendingPort() {
  try {
    vendingSerialPort = await getPort(
      vendingSerialPort,
      SERIAL_VENDING,
      SERIAL_VENDING_BAUD_RATE
    );

    vendingSerialPort.removeAllListeners("data");
    vendingSerialPort.removeAllListeners("close");
    vendingSerialPort.removeAllListeners("error");

    // Always listen for hardware messages, even without any HTTP request.
    vendingSerialPort.on("data", async (chunk) => {
      // const logResult = await logSerialData("vending", chunk)
      // console.log(`[serial:vending] logResult ->`, logResult);
    });
    vendingSerialPort.on("close", () => {
      scheduleReconnect("vending", connectVendingPort, "vending");
    });
    vendingSerialPort.on("error", () => {
      scheduleReconnect("vending", connectVendingPort, "vending");
    });
    vendingLastError = undefined;
    vendingLastConnectedAt = new Date().toISOString();
  } catch (error) {
    console.error(`[serial:vending] open failed: ${error.message}`);
    vendingLastError = error.message;
    scheduleReconnect("vending", connectVendingPort, "vending");
  }
}

async function connectNavigationLightsPort() {
  try {
    navigationLightsSerialPort = await getPort(
      navigationLightsSerialPort,
      SERIAL_NAVIGATION_LIGHTS,
      SERIAL_NAVIGATION_LIGHTS_BAUD_RATE
    );

    navigationLightsSerialPort.removeAllListeners("data");
    navigationLightsSerialPort.removeAllListeners("close");
    navigationLightsSerialPort.removeAllListeners("error");

    // Always listen for hardware messages, even without any HTTP request.
    navigationLightsSerialPort.on("data", async (chunk) => {
      handleNavigationLightsChunk(chunk);
    }
    );
    navigationLightsSerialPort.on("close", () => {
      if (navigationFrameTimer) clearTimeout(navigationFrameTimer);
      flushNavigationLightsFrame(navigationFrameBuffer);
      navigationFrameBuffer = Buffer.alloc(0);
      scheduleReconnect(
        "navigation-lights",
        connectNavigationLightsPort,
        "navigation"
      );
    });
    navigationLightsSerialPort.on("error", () => {
      scheduleReconnect(
        "navigation-lights",
        connectNavigationLightsPort,
        "navigation"
      );
    });
    navigationLastError = undefined;
    navigationLastConnectedAt = new Date().toISOString();
  } catch (error) {
    console.error(`[serial:navigation-lights] open failed: ${error.message}`);
    navigationLastError = error.message;
    scheduleReconnect(
      "navigation-lights",
      connectNavigationLightsPort,
      "navigation"
    );
  }
}

async function connectQrNfcPort() {
  try {
    qrNfcSerialPort = await getPort(qrNfcSerialPort, SERIAL_QR_NFC, SERIAL_QR_NFC_BAUD_RATE);

    qrNfcSerialPort.removeAllListeners("data");
    qrNfcSerialPort.removeAllListeners("close");
    qrNfcSerialPort.removeAllListeners("error");

    // Keep receiving QR/NFC scans continuously in background.
    qrNfcSerialPort.on("data", (chunk) => {
      handleQrNfcChunk(chunk);
    });
    qrNfcSerialPort.on("close", () => {
      if (qrNfcFrameTimer) clearTimeout(qrNfcFrameTimer);
      flushQrNfcFrame(qrNfcFrameBuffer);
      qrNfcFrameBuffer = Buffer.alloc(0);
      scheduleReconnect("qr-nfc", connectQrNfcPort, "qrNfc");
    });
    qrNfcSerialPort.on("error", () => {
      scheduleReconnect("qr-nfc", connectQrNfcPort, "qrNfc");
    });
    qrNfcLastError = undefined;
    qrNfcLastConnectedAt = new Date().toISOString();
  } catch (error) {
    console.error(`[serial:qr-nfc] open failed: ${error.message}`);
    qrNfcLastError = error.message;
    scheduleReconnect("qr-nfc", connectQrNfcPort, "qrNfc");
  }
}

export async function initializeSerialListeners() {
  // Start listeners at app boot so inbound data is never missed.
  await Promise.all([connectVendingPort(), connectNavigationLightsPort(), connectQrNfcPort()]);
}

async function writeToPort(port, data) {
  if (typeof data !== "string") {
    const payloadError = new Error("Serial payload must be a string hex payload");
    payloadError.status = 400;
    throw payloadError;
  }

  // Remove spacing to support payloads like "EE01 0000 ...".
  const normalizedHex = data.replace(/\s+/g, "");
  if (!/^[\da-fA-F]+$/.test(normalizedHex) || normalizedHex.length % 2 !== 0) {
    const payloadError = new Error("Serial payload must be a valid even-length hex string");
    payloadError.status = 400;
    throw payloadError;
  }
  const buffer = Buffer.from(normalizedHex, "hex");

  if (SERIAL_WRITE_DEBUG) {
    console.log(`[serial:${port.path}] TX -> ${normalizedHex}`);
    console.log(`[serial:${port.path}] tx [buffer] ->`, Array.from(buffer));
  }
  const responseChunk = await new Promise((resolve, reject) => {
    let settled = false;

    const safeResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    // Max time budget for the full request/response.
    const timeout = setTimeout(() => {
      cleanup();
      const timeoutError = new Error(
        `Serial response timeout after ${SERIAL_WRITE_TIMEOUT_MS} ms`
      );
      timeoutError.status = 504;
      safeReject(timeoutError);
    }, SERIAL_WRITE_TIMEOUT_MS);
    // Consider response complete when line stays idle briefly after receiving bytes.
    const responseIdleMs = 80;
    let responseIdleTimer;
    let hasAnyResponse = false;
    const chunks = [];

    const completeResponse = () => {
      cleanup();
      if (!hasAnyResponse) {
        const timeoutError = new Error(
          `Serial response timeout after ${SERIAL_WRITE_TIMEOUT_MS} ms`
        );
        timeoutError.status = 504;
        safeReject(timeoutError);
        return;
      }
      safeResolve(Buffer.concat(chunks));
    };

    const onData = (chunk) => {
      hasAnyResponse = true;
      chunks.push(chunk);
      const chunkHex = chunk.toString("hex").toUpperCase();
      if (SERIAL_WRITE_DEBUG) {
        console.log(`[serial:${port.path}] rx-chunk -> ${chunkHex}`);
        console.log(
          `[serial:${port.path}] rx-chunk [buffer] ->`,
          Array.from(chunk)
        );
      }
      if (responseIdleTimer) clearTimeout(responseIdleTimer);
      responseIdleTimer = setTimeout(completeResponse, responseIdleMs);
    };
    const onError = (error) => {
      cleanup();
      safeReject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      if (responseIdleTimer) clearTimeout(responseIdleTimer);
      port.off("data", onData);
      port.off("error", onError);
    };

    port.on("data", onData);
    port.on("error", onError);

    port.write(buffer, (writeError) => {
      if (writeError) {
        cleanup();
        safeReject(writeError);
        return;
      }

      port.drain((drainError) => {
        if (drainError) {
          cleanup();
          safeReject(drainError);
        }
      });
    });
  });
  const responseHex = responseChunk.toString("hex").toUpperCase();
  if (SERIAL_WRITE_DEBUG) {
    console.log(`[serial:${port.path}] writeToPort awaited-RX -> ${responseHex}`);
  }

  return {
    success: true,
    bytes: buffer.length,
    responseHex,
    responseBytes: Array.from(responseChunk),
  };
}

export async function writeVendingSerialData(data) {
  vendingSerialPort = await getPort(
    vendingSerialPort,
    SERIAL_VENDING,
    SERIAL_VENDING_BAUD_RATE
  );
  const result = await writeToPort(vendingSerialPort, data);
  vendingLastWriteAt = new Date().toISOString();

  console.log(
    `[serial:${vendingSerialPort.path}] writeVendingSerialData result ->`,
    JSON.stringify(result)
  );
  return result;
}

export async function writeNavigationLightsSerialData(data) {
  navigationLightsSerialPort = await getPort(
    navigationLightsSerialPort,
    SERIAL_NAVIGATION_LIGHTS,
    SERIAL_NAVIGATION_LIGHTS_BAUD_RATE
  );
  console.log(
    `[serial:${navigationLightsSerialPort.path}] writeNavigationLightsSerialData data ->`,
    JSON.stringify(data)
  );
  // const payloadHex = normalizeSerialHexPayload(data);
  const payloadHex = Buffer.from(JSON.stringify(data) + "\n").toString("hex");
  console.log(
    `[serial:${navigationLightsSerialPort.path}] writeNavigationLightsSerialData payloadHex ->`,
    payloadHex
  );
  const result = await writeToPort(navigationLightsSerialPort, payloadHex);
  navigationLastWriteAt = new Date().toISOString();
  // console.log(
  //   `[serial:${navigationLightsSerialPort.path}] writeNavigationLightsSerialData result ->`,
  //   JSON.stringify(result)
  // );
  return result;
}

export function getSerialConfig() {
  return {
    vending: {
      path: SERIAL_VENDING,
      baudRate: SERIAL_VENDING_BAUD_RATE,
    },
    navigationLights: {
      path: SERIAL_NAVIGATION_LIGHTS,
      baudRate: SERIAL_NAVIGATION_LIGHTS_BAUD_RATE,
    },
    qrNfc: {
      path: SERIAL_QR_NFC,
      baudRate: SERIAL_QR_NFC_BAUD_RATE,
    },
    writeTimeoutMs: SERIAL_WRITE_TIMEOUT_MS,
  };
}

function buildPortHealth({
  channel,
  configuredPath,
  configuredBaudRate,
  portInstance,
  reconnectTimer,
  lastConnectedAt,
  lastWriteAt,
  lastError,
}) {
  return {
    channel,
    configuredPath,
    configuredBaudRate,
    isConfigured: Boolean(configuredPath),
    isConnected: Boolean(portInstance?.isOpen),
    serialReady: Boolean(portInstance?.isOpen),
    isReconnectScheduled: Boolean(reconnectTimer),
    actualPath: portInstance?.path || null,
    bytesRead: portInstance?.bytesRead ?? null,
    bytesWritten: portInstance?.bytesWritten ?? null,
    readable: portInstance?.readable ?? null,
    writable: portInstance?.writable ?? null,
    lastConnectedAt: lastConnectedAt || null,
    lastWriteAt: lastWriteAt || null,
    lastError: lastError || null,
  };
}

export function getSerialHealthSnapshot() {
  const vending = buildPortHealth({
    channel: "vending",
    configuredPath: SERIAL_VENDING,
    configuredBaudRate: SERIAL_VENDING_BAUD_RATE,
    portInstance: vendingSerialPort,
    reconnectTimer: vendingReconnectTimer,
    lastConnectedAt: vendingLastConnectedAt,
    lastWriteAt: vendingLastWriteAt,
    lastError: vendingLastError,
  });
  const navigationLights = buildPortHealth({
    channel: "navigation-lights",
    configuredPath: SERIAL_NAVIGATION_LIGHTS,
    configuredBaudRate: SERIAL_NAVIGATION_LIGHTS_BAUD_RATE,
    portInstance: navigationLightsSerialPort,
    reconnectTimer: navigationReconnectTimer,
    lastConnectedAt: navigationLastConnectedAt,
    lastWriteAt: navigationLastWriteAt,
    lastError: navigationLastError,
  });
  const qrNfc = buildPortHealth({
    channel: "qr-nfc",
    configuredPath: SERIAL_QR_NFC,
    configuredBaudRate: SERIAL_QR_NFC_BAUD_RATE,
    portInstance: qrNfcSerialPort,
    reconnectTimer: qrNfcReconnectTimer,
    lastConnectedAt: qrNfcLastConnectedAt,
    lastWriteAt: null,
    lastError: qrNfcLastError,
  });

  const ports = {
    vending,
    navigationLights,
    qrNfc,
  };
  const connectedPorts = Object.values(ports).filter((port) => port.serialReady).length;
  const totalPorts = Object.keys(ports).length;

  return {
    serialReady: connectedPorts === totalPorts,
    summary: {
      connectedPorts,
      totalPorts,
    },
    ports,
  };
}
