import { SerialPort } from "serialport";
import {
  SERIAL_NAVIGATION_LIGHTS,
  SERIAL_NAVIGATION_LIGHTS_BAUD_RATE,
  SERIAL_VENDING,
  SERIAL_VENDING_BAUD_RATE,
  SERIAL_WRITE_TIMEOUT_MS,
} from "../config/env.js";

let vendingSerialPort;
let navigationLightsSerialPort;
let vendingReconnectTimer;
let navigationReconnectTimer;
let vendingLastError;
let navigationLastError;
let vendingLastConnectedAt;
let navigationLastConnectedAt;
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
}

function scheduleReconnect(channel, connectFn, timerRefName) {
  if (timerRefName === "vending" && vendingReconnectTimer) {
    return;
  }

  if (timerRefName === "navigation" && navigationReconnectTimer) {
    return;
  }

  // Keep reconnecting in background when cable/device is temporarily unavailable.
  const timer = setTimeout(async () => {
    try {
      await connectFn();
    } finally {
      if (timerRefName === "vending") {
        vendingReconnectTimer = undefined;
      } else {
        navigationReconnectTimer = undefined;
      }
    }
  }, 2000);

  if (timerRefName === "vending") {
    vendingReconnectTimer = timer;
  } else {
    navigationReconnectTimer = timer;
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

export async function initializeSerialListeners() {
  // Start both listeners at app boot so inbound data is never missed.
  await Promise.all([connectVendingPort(), connectNavigationLightsPort()]);
}

async function writeToPort(port, data) {
  await new Promise((resolve, reject) => {
    // Protect API from hanging forever if hardware stops responding.
    const timeout = setTimeout(() => {
      const timeoutError = new Error(
        `Serial write timeout after ${SERIAL_WRITE_TIMEOUT_MS} ms`
      );
      timeoutError.status = 504;
      reject(timeoutError);
    }, SERIAL_WRITE_TIMEOUT_MS);

    port.write(data, (writeError) => {
      if (writeError) {
        clearTimeout(timeout);
        reject(writeError);
        return;
      }

      port.drain((drainError) => {
        clearTimeout(timeout);
        if (drainError) {
          reject(drainError);
          return;
        }
        resolve();
      });
    });
  });

  return {
    success: true,
    bytes: Buffer.byteLength(data),
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

  const ports = {
    vending,
    navigationLights,
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
