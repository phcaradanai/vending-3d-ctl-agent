import mqtt from "mqtt";
import {
  MQTT_BROKER_URL,
  MQTT_CLIENT_ID,
  MQTT_ENABLED,
  MQTT_PASSWORD,
  MQTT_QRNFC_QOS,
  MQTT_QRNFC_RETAIN,
  matchQrNfcMifareFromBytes,
  MQTT_QRNFC_BARCODE_WNY_SIGNATURE_REGEX,
  MQTT_QRNFC_TOPIC,
  MQTT_USERNAME,
} from "../config/env.js";
import { logAgent } from "../logger/logAgent.js";
import { publishQrNfcEvent } from "./qr-nfc.events.js";
import { buildScannerEvent } from "./scanner-event.js";
import { publishScannerEvent } from "./nats.service.js";

/** Max UTF-8 length of `payload` stored in `events-mqtt.log` (remainder noted in field). */
const MQTT_LOG_PAYLOAD_MAX_CHARS = 65536;

let mqttClient;
let isMqttConnected = false;
let isMqttReconnecting = false;
let lastConnectedAt;
let lastDisconnectedAt;
let lastError;

function serializeMqttPublishBody(payload) {
  try {
    if (typeof payload === "string" || Buffer.isBuffer(payload)) return payload;
    return JSON.stringify(payload);
  } catch (err) {
    return JSON.stringify({ error: "mqtt_payload_serialize_failed", message: err.message });
  }
}

function mqttPayloadForLog(payload) {
  const body = serializeMqttPublishBody(payload);
  const s = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
  if (s.length <= MQTT_LOG_PAYLOAD_MAX_CHARS) return s;
  return `${s.slice(0, MQTT_LOG_PAYLOAD_MAX_CHARS)}…(truncated, ${s.length} chars total)`;
}

export function getMqttClient() {
  if (!MQTT_ENABLED) return null;
  if (mqttClient) return mqttClient;

  mqttClient = mqtt.connect(MQTT_BROKER_URL, {
    clientId: MQTT_CLIENT_ID,
    username: MQTT_USERNAME || undefined,
    password: MQTT_PASSWORD || undefined,
    reconnectPeriod: 2000,
  });

  mqttClient.on("connect", () => {
    isMqttConnected = true;
    isMqttReconnecting = false;
    lastConnectedAt = new Date().toISOString();
    lastError = undefined;
    console.log(`[mqtt] connected -> ${MQTT_BROKER_URL}`);
    logAgent.mqtt({
      event: "mqtt.connect",
      brokerUrl: MQTT_BROKER_URL,
      clientId: MQTT_CLIENT_ID,
      topic: MQTT_QRNFC_TOPIC,
    });
  });
  mqttClient.on("reconnect", () => {
    isMqttReconnecting = true;
    console.log("[mqtt] reconnecting...");
    logAgent.mqtt({ event: "mqtt.reconnect", brokerUrl: MQTT_BROKER_URL, clientId: MQTT_CLIENT_ID });
  });
  mqttClient.on("close", () => {
    isMqttConnected = false;
    lastDisconnectedAt = new Date().toISOString();
    console.log("[mqtt] connection closed");
    logAgent.mqtt({ event: "mqtt.close", brokerUrl: MQTT_BROKER_URL, clientId: MQTT_CLIENT_ID });
  });
  mqttClient.on("error", (error) => {
    lastError = error.message;
    console.error(`[mqtt] error: ${error.message}`);
    logAgent.mqtt({
      event: "mqtt.error",
      brokerUrl: MQTT_BROKER_URL,
      clientId: MQTT_CLIENT_ID,
      message: error.message,
    });
  });

  return mqttClient;
}

export function initializeMqttPublisher() {
  if (!MQTT_ENABLED) {
    console.log("[mqtt] disabled (MQTT_ENABLED=false)");
    logAgent.mqtt({ event: "mqtt.disabled" });
    return null;
  }
  console.log(
    `[mqtt] initializing 
    client=${MQTT_CLIENT_ID} 
    broker=${MQTT_BROKER_URL} 
    topic=${MQTT_QRNFC_TOPIC}`
  );
  return getMqttClient();
}

export async function publishMqttMessage(topic, payload, options = {}) {
  if (!MQTT_ENABLED) return false;
  const client = getMqttClient();
  if (!client || !isMqttConnected) {
    console.log("[mqtt] skip publish: client not connected");
    const body = serializeMqttPublishBody(payload);
    const bodyStr = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
    logAgent.mqtt({
      event: "mqtt.publish.skipped",
      topic,
      reason: "not_connected",
      bodyLength: bodyStr.length,
      payload: mqttPayloadForLog(bodyStr),
    });
    return false;
  }

  const body = serializeMqttPublishBody(payload);

  const publishOptions = {
    qos: MQTT_QRNFC_QOS,
    retain: MQTT_QRNFC_RETAIN,
    ...options,
  };

  await new Promise((resolve, reject) => {
    client.publish(topic, body, publishOptions, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const bodyStr = typeof body === "string" ? body : body.toString("utf8");
  logAgent.mqtt({
    event: "mqtt.publish",
    topic,
    qos: publishOptions.qos,
    retain: publishOptions.retain,
    bodyLength: bodyStr.length,
    payload: mqttPayloadForLog(bodyStr),
  });
  return true;
}

export function getMqttStatus() {
  return {
    enabled: MQTT_ENABLED,
    brokerUrl: MQTT_BROKER_URL,
    clientId: MQTT_CLIENT_ID,
    topic: MQTT_QRNFC_TOPIC,
    isConnected: isMqttConnected,
    isReconnecting: isMqttReconnecting,
    lastConnectedAt: lastConnectedAt || null,
    lastDisconnectedAt: lastDisconnectedAt || null,
    lastError: lastError || null,
  };
}

export async function publishQrNfcPayload({ payloadText, payloadBytes, portPath, mifare = {} }) {
  // แยกประเภทข้อมูล QR Code/NFC (โดยเฉพาะสำหรับ Mifare signature)
  let type = "unknown";

  // ตรวจสอบความน่าจะเป็นข้อมูล NFC Mifare: prefix 5 byte (รองรับหลายแบบ — ZK QR500-bm Linux ใช้ 02,01,… แทน 02,FF,…)
  if (Array.isArray(payloadBytes) && matchQrNfcMifareFromBytes(payloadBytes)) {
    type = "nfc-mifare";
  }
  else if (typeof payloadText === "string") {
    // อีกกรณี: ความยาว 8–16 ตัวอักษร (hex/dec) = nfc ตามเดิม, นอกนั้นเป็น qrcode


    /* ## QRCODE PAYLOAD FORMAT  WNY ##
    uuid_machinecode_medcode_qty_out_timestamp 
    fa97dbc9-3e28-4978-9588-9008bd86209f_00020002_1000174_1_OUT_20260507235753
    */
    // console.log(`[mqtt] payloadText ->`, payloadText);
    const qrWnyRegex = MQTT_QRNFC_BARCODE_WNY_SIGNATURE_REGEX
    // /([0-9a-f\-]{36})_(\d{8})_(\d+)_(\d+)_(IN|OUT)_(\d{14})/i;

    if (qrWnyRegex.test(payloadText)) {
      type = "qrcode_wny";
    } else {
      type = "qrcode_unknown";
    }


  }

  let action = "unknown";
  if (type === "qrcode_wny") {
    action = "reader"
  } else if (type === "nfc-mifare") {
    action = "mifare"
  }

  console.log(`[mqtt] payloadText ->`, typeof (payloadText));
  const scanEvent = {
    act: action,
    code: type === "nfc-mifare" && mifare && mifare.uid ? Buffer.from(mifare.uid).toString("hex").toUpperCase() : payloadText,
    raw: payloadBytes,
    uid: "",
    ts: new Date().toISOString(),
    info: {
      mifare,
      channel: "qr-nfc",
      portPath,
      payloadText,
      payloadHex: Buffer.from(payloadBytes).toString("hex").toUpperCase(),
      payloadBytes,
      type,
    }
  };

  // Keep the legacy local SSE/MQTT payload available while Core uses the
  // canonical JetStream envelope below. Every event remains cabinet-scoped.
  // JetStream is the Core integration path. Keep the complete raw frame and
  // the parsed value in one envelope so QR, barcode and NFC consumers share it.
  const scannerEvent = buildScannerEvent({ payloadText, payloadBytes, portPath, mifare });
  scanEvent.scanType = scannerEvent.scanType;
  scanEvent.scanPurpose = scannerEvent.scanPurpose;
  scanEvent.info.scanType = scannerEvent.scanType;
  scanEvent.info.scanPurpose = scannerEvent.scanPurpose;
  const message = JSON.stringify(scanEvent);
  console.log(`[mqtt] publishQrNfcPayload message ->`, message);
  publishQrNfcEvent(scanEvent);
  const natsPublishOk = await publishScannerEvent(scannerEvent);

  const topic = MQTT_QRNFC_TOPIC;
  const publishOk = await publishMqttMessage(topic, message, {
    qos: MQTT_QRNFC_QOS,
    retain: MQTT_QRNFC_RETAIN,
  });
  logAgent.mqtt({
    event: "mqtt.qrnfc.scan",
    topic,
    portPath,
    readerType: type,
    action,
    publishOk,
    natsPublishOk,
    eventId: scannerEvent.eventId,
    payload: mqttPayloadForLog(message),
  });
  // A scanner event is successfully forwarded when either configured Core
  // (JetStream) or legacy MQTT transport accepted it.
  return publishOk || natsPublishOk;
}
