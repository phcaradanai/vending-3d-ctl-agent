import mqtt from "mqtt";
import {
  MQTT_BROKER_URL,
  MQTT_CLIENT_ID,
  MQTT_ENABLED,
  MQTT_PASSWORD,
  MQTT_QRNFC_QOS,
  MQTT_QRNFC_RETAIN,
  MQTT_QRNFC_MIFARE_SIGNATURE,
  MQTT_QRNFC_BARCODE_WNY_SIGNATURE_REGEX,
  MQTT_QRNFC_TOPIC,
  MQTT_USERNAME,
  CUSTOMER_CODE,
  VENDING_CODE,
} from "../config/env.js";

let mqttClient;
let isMqttConnected = false;
let isMqttReconnecting = false;
let lastConnectedAt;
let lastDisconnectedAt;
let lastError;

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
  });
  mqttClient.on("reconnect", () => {
    isMqttReconnecting = true;
    console.log("[mqtt] reconnecting...");
  });
  mqttClient.on("close", () => {
    isMqttConnected = false;
    lastDisconnectedAt = new Date().toISOString();
    console.log("[mqtt] connection closed");
  });
  mqttClient.on("error", (error) => {
    lastError = error.message;
    console.error(`[mqtt] error: ${error.message}`);
  });

  return mqttClient;
}

export function initializeMqttPublisher() {
  if (!MQTT_ENABLED) {
    console.log("[mqtt] disabled (MQTT_ENABLED=false)");
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
    return false;
  }

  const body =
    typeof payload === "string" || Buffer.isBuffer(payload)
      ? payload
      : JSON.stringify(payload);

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

export async function publishQrNfcPayload({ payloadText, payloadBytes, portPath }) {
  // แยกประเภทข้อมูล QR Code/NFC (โดยเฉพาะสำหรับ Mifare signature)
  let type = "unknown";

  // ตรวจสอบความน่าจะเป็นข้อมูล NFC Mifare: มัก payloadBytes เป็นความยาว 5 bytes และรูปแบบ 0x02, 0xFF, 0x01, 0x09, 0x00 ขึ้นต้น (ตัวอย่าง signature สำหรับ Mifare Classic)
  // หมายเหตุ: Signature อื่นๆ อาจจะต้องปรับแต่งตาม scanner ที่ใช้หรือ document ของ NFC รุ่นนั้นๆ
  const mifareClassicSignature = MQTT_QRNFC_MIFARE_SIGNATURE;

  if (
    Array.isArray(payloadBytes) &&
    payloadBytes.length >= 5 &&
    mifareClassicSignature.every((sig, i) => payloadBytes[i] === sig)
  ) {
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

console.log(`[mqtt] payloadText ->`, typeof(payloadText));
  const message = JSON.stringify({
    act: action,
    code: type === "nfc-mifare"
      ? Buffer.from(payloadBytes).toString("hex").toUpperCase()
      : payloadText,
    raw: payloadBytes,
    uid: "",
    ts: new Date().toISOString(),
    info: {
      channel: "qr-nfc",
      portPath,
      payloadText,
      payloadHex: Buffer.from(payloadBytes).toString("hex").toUpperCase(),
      payloadBytes,
      type,
    }
  });
  console.log(`[mqtt] publishQrNfcPayload message ->`, message);

  return publishMqttMessage(`hm/${CUSTOMER_CODE}/${VENDING_CODE}/reader`, message, {
    qos: MQTT_QRNFC_QOS,
    retain: MQTT_QRNFC_RETAIN,
  });
}
