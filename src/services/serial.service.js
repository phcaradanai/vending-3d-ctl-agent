import { SerialPort } from "serialport";
import {
  MQTT_QRNFC_MIFARE_SIGNATURE,
  SERIAL_NAVIGATION_LIGHTS,
  SERIAL_NAVIGATION_LIGHTS_BAUD_RATE,
  SERIAL_QR_NFC,
  SERIAL_QR_NFC_BAUD_RATE,
  SERIAL_NAVIGATION_LIGHTS_FRAME_DEBUG,
  SERIAL_NAVIGATION_LIGHTS_RETRY_DELAY_MS,
  SERIAL_NAVIGATION_LIGHTS_WRITE_RETRY,
  SERIAL_VENDING,
  SERIAL_VENDING_BAUD_RATE,
  SERIAL_PORT_QUEUE_LOG,
  SERIAL_WRITE_DEBUG,
  SERIAL_WRITE_TIMEOUT_MS,
} from "../config/env.js";
import { publishQrNfcPayload } from "./mqtt.service.js";
import { logAgent } from "../logger/logAgent.js";


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
const portWriteQueue = new Map();
/** Per `port.path`: FIFO labels waiting + current runner (for queue logging). */
const portQueueMeta = new Map();
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

function getPortQueueMeta(key) {
  if (!portQueueMeta.has(key)) {
    portQueueMeta.set(key, { order: [], running: null });
  }
  return portQueueMeta.get(key);
}

/** Normalize TX hex for queue snapshot (uppercase, no spaces); empty → null. */
function normalizeQueueTxHex(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).replace(/\s+/g, "").toUpperCase();
  return s.length ? s : null;
}

function queueHexForLog(hex) {
  if (!hex) return "—";
  if (hex.length <= 72) return hex;
  return `${hex.slice(0, 72)}…(${hex.length} hex chars)`;
}

function formatQueueJobsForLog(jobs) {
  if (!jobs.length) return "—";
  return jobs.map((j) => `${j.label}<${queueHexForLog(j.txHex)}>`).join(" → ");
}

/**
 * @param {string} portPath
 * @param {{ phase: string; label?: string; txHex?: string | null; message: string; waitingCount?: number; behind?: string }} detail
 */
function logPortQueue(portPath, detail) {
  if (SERIAL_PORT_QUEUE_LOG) {
    console.log(`[serial-queue:${portPath}] ${detail.message}`);
  }
  logAgent.queue({
    event: "serial.queue",
    portPath,
    phase: detail.phase,
    label: detail.label,
    txHex: detail.txHex ?? null,
    waitingCount: detail.waitingCount,
    behind: detail.behind,
    message: detail.message,
  });
}

/**
 * Serialize writes per COM path.
 * @param {import("serialport").SerialPort} port
 * @param {string} label
 * @param {string | null | undefined} txHex — bytes to send as even-length hex (for `/health` & `/job/que`); null if unknown
 * @param {() => Promise<unknown>} task
 */
async function withPortWriteQueue(port, label, txHex, task) {
  const key = port?.path || "unknown-port";
  const meta = getPortQueueMeta(key);
  const job = { label, txHex: normalizeQueueTxHex(txHex) };
  meta.order.push(job);
  const tail = formatQueueJobsForLog(meta.order);
  const active =
    meta.running && typeof meta.running === "object"
      ? `${meta.running.label}<${queueHexForLog(meta.running.txHex)}>`
      : "—";
  logPortQueue(key, {
    phase: "enqueue",
    label,
    txHex: job.txHex,
    waitingCount: meta.order.length,
    message: `+ ENQUEUE "${label}" txHex=${queueHexForLog(job.txHex)} | คิวรอ: [${tail}] | กำลังรัน: ${active}`,
  });

  const previous = portWriteQueue.get(key) || Promise.resolve();

  const current = previous
    .catch(() => {})
    .then(async () => {
      const next = meta.order.shift() || job;
      meta.running = { label: next.label, txHex: next.txHex ?? null };
      const behind = formatQueueJobsForLog(meta.order);
      logPortQueue(key, {
        phase: "run",
        label: next.label,
        txHex: next.txHex,
        behind,
        waitingCount: meta.order.length,
        message: `▶ RUN "${next.label}" txHex=${queueHexForLog(next.txHex)} | ต่อคิว: [${behind}]`,
      });
      try {
        return await task();
      } finally {
        meta.running = null;
        logPortQueue(key, {
          phase: "done",
          label: next.label,
          waitingCount: meta.order.length,
          behind: formatQueueJobsForLog(meta.order),
          message: `■ DONE "${next.label}" | เหลือในคิว: [${formatQueueJobsForLog(meta.order)}]`,
        });
      }
    })
    .finally(() => {
      if (portWriteQueue.get(key) === current) {
        portWriteQueue.delete(key);
        if (!meta.order.length && !meta.running) {
          portQueueMeta.delete(key);
        }
      }
    });

  portWriteQueue.set(key, current);
  return current;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  // console.log(`[serial:qr-nfc] payload -> ${payload}`);
  // console.log(`[serial:qr-nfc] Buffer ->`, Array.from(buffer));

  

  // แยกข้อมูล mifare: HEADER (5 bytes), UID (4 bytes), Data/Other (เหลือ)
  // ตัวอย่าง: [HEADER][UID][DATA/อื่นๆ]
  // มี signature จาก config: MQTT_QRNFC_MIFARE_SIGNATURE
  try {
    // import อะไรเพิ่มไม่ได้ ใช้ global เอาจาก config
    const headerLength = MQTT_QRNFC_MIFARE_SIGNATURE.length;
    if (
      buffer.length >= headerLength + 4 && // HEADER + UID อย่างต่ำ
      MQTT_QRNFC_MIFARE_SIGNATURE.every(
        (val, idx) => buffer[idx] === val
      )
    ) {
      // ตรง signature mifare
      const header = Array.from(buffer.slice(0, headerLength));
      const uid = Array.from(buffer.slice(headerLength, headerLength + 4));
      const rest = Array.from(buffer.slice(headerLength + 4));
      console.log(`[serial:qr-nfc][Mifare] header:`, header, `uid:`, uid, `rest:`, rest);
      // เพิ่ม field พิเศษ ส่งไปด้วย
      publishQrNfcPayload({
        payloadText: payload,
        payloadBytes: Array.from(buffer),
        portPath: qrNfcSerialPort?.path || SERIAL_QR_NFC,
        mifare: {
          header,
          uid,
          rest,
        }
      }).catch((error) => {
        console.error(`[mqtt] publish failed for qr-nfc/mifare: ${error.message}`);
      });
      return; // เสร็จแล้วไม่ต้อง publish ข้างล่างซ้ำ
    }
  } catch (err) {
    console.error("[serial:qr-nfc][Mifare] frame parse error:", err);
  }
  
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

export async function writeVendingSerialData(data, queueLabel = "vending-hex") {
  vendingSerialPort = await getPort(
    vendingSerialPort,
    SERIAL_VENDING,
    SERIAL_VENDING_BAUD_RATE
  );
  const result = await withPortWriteQueue(
    vendingSerialPort,
    queueLabel,
    normalizeQueueTxHex(data),
    () => writeToPort(vendingSerialPort, data)
  );
  vendingLastWriteAt = new Date().toISOString();

  console.log(
    `[serial:${vendingSerialPort.path}] writeVendingSerialData result ->`,
    JSON.stringify(result)
  );
  logAgent.serial({
    event: "serial.vending.write.done",
    portPath: vendingSerialPort.path,
    queueLabel,
    txHexPrefix: normalizeQueueTxHex(data)?.slice(0, 256) ?? null,
    responseHexPrefix: result.responseHex?.slice(0, 256) ?? null,
    txBytes: result.bytes,
  });
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
  let result;
  let lastError;
  const maxAttempt = Math.max(1, SERIAL_NAVIGATION_LIGHTS_WRITE_RETRY + 1);
  for (let attempt = 1; attempt <= maxAttempt; attempt += 1) {
    try {
      result = await withPortWriteQueue(
        navigationLightsSerialPort,
        `nav-lights-rx#${attempt}`,
        payloadHex,
        () => writeToPort(navigationLightsSerialPort, payloadHex)
      );
      break;
    } catch (error) {
      lastError = error;
      const isTimeout = Number(error?.status) === 504;
      const shouldRetry = isTimeout && attempt < maxAttempt;
      console.warn(
        `[serial:${navigationLightsSerialPort.path}] write attempt ${attempt}/${maxAttempt} failed: ${error.message}`
      );
      if (!shouldRetry) {
        throw error;
      }
      await sleep(SERIAL_NAVIGATION_LIGHTS_RETRY_DELAY_MS);
    }
  }
  navigationLastWriteAt = new Date().toISOString();
  // console.log(
  //   `[serial:${navigationLightsSerialPort.path}] writeNavigationLightsSerialData result ->`,
  //   JSON.stringify(result)
  // );
  if (!result && lastError) {
    throw lastError;
  }
  logAgent.serial({
    event: "serial.navigation.write.done",
    portPath: navigationLightsSerialPort.path,
    act: data && typeof data === "object" ? data.act ?? null : null,
    payloadHexPrefix: payloadHex.slice(0, 256),
    responseHexPrefix: result.responseHex?.slice(0, 256) ?? null,
    txBytes: result.bytes,
  });
  return result;
}

export async function writeNavigationLightsSerialDataNoWait(data) {
  navigationLightsSerialPort = await getPort(
    navigationLightsSerialPort,
    SERIAL_NAVIGATION_LIGHTS,
    SERIAL_NAVIGATION_LIGHTS_BAUD_RATE
  );
  const payloadHex = Buffer.from(JSON.stringify(data) + "\n").toString("hex");
  const txBuffer = Buffer.from(payloadHex, "hex");

  await withPortWriteQueue(navigationLightsSerialPort, "nav-lights-no-wait", payloadHex, () => new Promise((resolve, reject) => {
    navigationLightsSerialPort.write(txBuffer, (writeError) => {
      if (writeError) {
        reject(writeError);
        return;
      }
      navigationLightsSerialPort.drain((drainError) => {
        if (drainError) {
          reject(drainError);
          return;
        }
        resolve();
      });
    });
  }));

  navigationLastWriteAt = new Date().toISOString();
  logAgent.serial({
    event: "serial.navigation.write.no_wait",
    portPath: navigationLightsSerialPort.path,
    act: data && typeof data === "object" ? data.act ?? null : null,
    payloadHexPrefix: payloadHex.slice(0, 256),
    txBytes: txBuffer.length,
  });
  return {
    success: true,
    bytes: txBuffer.length,
    accepted: data,
    mode: "no-wait",
  };
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

/**
 * Snapshot of per-COM serial **write** queues (same labels as `SERIAL_PORT_QUEUE_LOG` console).
 * @param {Record<string, { actualPath?: string | null, configuredPath?: string }>} [ports] — e.g. `getSerialHealthSnapshot().ports`
 */
export function getSerialWriteQueueSnapshot(ports = {}) {
  const pickPath = (p) => p?.actualPath || p?.configuredPath || null;

  function peek(path) {
    const key = path || "unknown-port";
    const meta = portQueueMeta.get(key);
    if (!meta) {
      return {
        queueKey: key,
        runningLabel: null,
        runningTxHex: null,
        runningJob: null,
        waitingLabels: [],
        waitingJobs: [],
        waitingTxHex: [],
        waitingCount: 0,
        busy: false,
      };
    }
    const waitingJobs = meta.order.map((j) => ({
      label: j.label,
      txHex: j.txHex ?? null,
    }));
    const waitingLabels = waitingJobs.map((j) => j.label);
    const waitingTxHex = waitingJobs.map((j) => j.txHex);
    const runningJob =
      meta.running && typeof meta.running === "object"
        ? {
            label: meta.running.label,
            txHex: meta.running.txHex ?? null,
          }
        : null;
    return {
      queueKey: key,
      runningLabel: runningJob?.label ?? null,
      runningTxHex: runningJob?.txHex ?? null,
      runningJob,
      waitingLabels,
      waitingJobs,
      waitingTxHex,
      waitingCount: meta.order.length,
      busy: Boolean(runningJob || meta.order.length),
    };
  }

  const vPath = pickPath(ports.vending);
  const nPath = pickPath(ports.navigationLights);
  const qPath = pickPath(ports.qrNfc);

  return {
    channels: {
      vending: peek(vPath),
      navigationLights: peek(nPath),
      qrNfc: {
        queueKey: qPath,
        runningLabel: null,
        runningTxHex: null,
        runningJob: null,
        waitingLabels: [],
        waitingJobs: [],
        waitingTxHex: [],
        waitingCount: 0,
        busy: false,
        note: "No HTTP write queue on qr-nfc in this service.",
      },
    },
    activeQueueKeys: [...portQueueMeta.keys()],
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
