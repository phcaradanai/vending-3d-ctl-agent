import { SerialPort } from "serialport";
import {
  SERIAL_NAVIGATION_LIGHTS,
  SERIAL_NAVIGATION_LIGHTS_BAUD_RATE,
  SERIAL_QR_NFC,
  SERIAL_QR_NFC_BAUD_RATE,
  SERIAL_VENDING,
  SERIAL_VENDING_BAUD_RATE,
  SERIAL_WRITE_TIMEOUT_MS,
} from "../config/env.js";

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
  console.log(`[serial:${channel}] rx -> ${payload}`);
  console.log(`[serial:${channel}] rx [buffer] ->`, Array.from(chunk));
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
    vendingSerialPort.on("data", (chunk) => logSerialData("vending", chunk));
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
    navigationLightsSerialPort.on("data", (chunk) =>
      logSerialData("navigation-lights", chunk)
    );
    navigationLightsSerialPort.on("close", () => {
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
    qrNfcSerialPort.on("data", (chunk) => logSerialData("qr-nfc", chunk));
    qrNfcSerialPort.on("close", () => {
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
  // Remove spacing to support payloads like "EE01 0000 ...".
  const normalizedHex = data.replace(/\s+/g, "");
  if (!/^[\da-fA-F]+$/.test(normalizedHex) || normalizedHex.length % 2 !== 0) {
    const payloadError = new Error("Serial payload must be a valid even-length hex string");
    payloadError.status = 400;
    throw payloadError;
  }
  const buffer = Buffer.from(normalizedHex, "hex");

  console.log(`[serial:${port.path}] tx -> ${normalizedHex}`);
  console.log(`[serial:${port.path}] tx [buffer] ->`, Array.from(buffer));
  const responseChunk = await new Promise((resolve, reject) => {
    // Protect API from hanging forever if hardware stops responding.
    const timeout = setTimeout(() => {
      cleanup();
      const timeoutError = new Error(
        `Serial response timeout after ${SERIAL_WRITE_TIMEOUT_MS} ms`
      );
      timeoutError.status = 504;
      reject(timeoutError);
    }, SERIAL_WRITE_TIMEOUT_MS);

    const onData = (chunk) => {
      cleanup();
      resolve(chunk);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      port.off("data", onData);
      port.off("error", onError);
    };

    port.on("data", onData);
    port.on("error", onError);

    port.write(buffer, (writeError) => {
      if (writeError) {
        cleanup();
        reject(writeError);
        return;
      }

      port.drain((drainError) => {
        if (drainError) {
          cleanup();
          reject(drainError);
        }
      });
    });
  });
  const responseHex = responseChunk.toString("hex").toUpperCase();
  console.log(`[serial:${port.path}] awaited-rx -> ${responseHex}`);

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
  return result;
}

export async function writeNavigationLightsSerialData(data) {
  navigationLightsSerialPort = await getPort(
    navigationLightsSerialPort,
    SERIAL_NAVIGATION_LIGHTS,
    SERIAL_NAVIGATION_LIGHTS_BAUD_RATE
  );
  const result = await writeToPort(navigationLightsSerialPort, data);
  navigationLastWriteAt = new Date().toISOString();
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
