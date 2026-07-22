import { connect, StringCodec } from "nats";
import {
  KIOSK_CODE,
  NATS_CLIENT_NAME,
  NATS_ENABLED,
  NATS_SCANNER_STREAM,
  NATS_SCANNER_SUBJECT,
  NATS_URL,
} from "../config/env.js";
import { logAgent } from "../logger/logAgent.js";

const codec = StringCodec();
let connection;
let jetstream;
let connecting;
let lastError;
let connectedAt;

async function connectPublisher() {
  if (!NATS_ENABLED) return null;
  if (connection && !connection.isClosed()) return connection;
  if (connecting) return connecting;

  connecting = connect({
    servers: NATS_URL,
    name: NATS_CLIENT_NAME,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 2000,
  })
    .then((nc) => {
      connection = nc;
      jetstream = nc.jetstream();
      connectedAt = new Date().toISOString();
      lastError = undefined;
      logAgent.app({
        event: "nats.connected",
        url: NATS_URL,
        clientName: NATS_CLIENT_NAME,
        scannerSubject: NATS_SCANNER_SUBJECT,
        scannerStream: NATS_SCANNER_STREAM,
      });
      return nc;
    })
    .catch((error) => {
      lastError = error.message;
      logAgent.error({ event: "nats.connect.failed", url: NATS_URL, message: error.message });
      throw error;
    })
    .finally(() => {
      connecting = undefined;
    });

  return connecting;
}

/** Start the optional JetStream publisher without making scanner boot depend on Core. */
export async function initializeNatsPublisher() {
  if (!NATS_ENABLED) {
    console.log("[nats] disabled (NATS_ENABLED=false)");
    return null;
  }
  try {
    return await connectPublisher();
  } catch (error) {
    console.warn(`[nats] initial connection unavailable; will retry on scan: ${error.message}`);
    return null;
  }
}

/**
 * Publish the canonical scanner envelope to Core's JetStream subject.
 * The event id is used as the JetStream message id for de-duplication.
 */
export async function publishScannerEvent(event) {
  if (!NATS_ENABLED) return false;
  try {
    await connectPublisher();
    if (!jetstream) return false;
    const data = codec.encode(JSON.stringify(event));
    const ack = await jetstream.publish(NATS_SCANNER_SUBJECT, data, {
      msgID: event.eventId,
    });
    logAgent.app({
      event: "nats.scanner.publish",
      subject: NATS_SCANNER_SUBJECT,
      stream: ack?.stream || NATS_SCANNER_STREAM,
      sequence: ack?.seq ?? null,
      eventId: event.eventId,
      kioskCode: event.kioskCode,
    });
    return true;
  } catch (error) {
    lastError = error.message;
    logAgent.error({
      event: "nats.scanner.publish.failed",
      subject: NATS_SCANNER_SUBJECT,
      eventId: event?.eventId ?? null,
      kioskCode: event?.kioskCode ?? KIOSK_CODE,
      message: error.message,
    });
    return false;
  }
}

export function getNatsStatus() {
  return {
    enabled: NATS_ENABLED,
    url: NATS_URL,
    clientName: NATS_CLIENT_NAME,
    scannerSubject: NATS_SCANNER_SUBJECT,
    scannerStream: NATS_SCANNER_STREAM,
    kioskCode: KIOSK_CODE,
    isConnected: Boolean(connection && !connection.isClosed()),
    connectedAt: connectedAt || null,
    lastError: lastError || null,
  };
}
