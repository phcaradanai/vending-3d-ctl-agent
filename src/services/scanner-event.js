import crypto from "node:crypto";
import {
  KIOSK_CODE,
  MQTT_QRNFC_BARCODE_WNY_SIGNATURE_REGEX,
  SERIAL_QR_NFC_BAUD_RATE,
} from "../config/env.js";

function parseWnySticker(value) {
  const regex = MQTT_QRNFC_BARCODE_WNY_SIGNATURE_REGEX;
  regex.lastIndex = 0;
  const match = regex.exec(value);
  if (!match) return null;
  return {
    prescription_id: match[1],
    sticker_kiosk_code: match[2],
    medication_code: match[3],
    quantity: Number(match[4]),
    direction: match[5],
    issued_at: match[6],
  };
}

/**
 * Build the single scanner envelope shared by QR, barcode and NFC transports.
 * `raw` is never discarded; `value`/`parsed` are the readable representation
 * Core uses to continue the kiosk flow.
 */
export function buildScannerEvent({ payloadText, payloadBytes = [], portPath, mifare = {} }) {
  const bytes = Array.isArray(payloadBytes) ? payloadBytes.map((item) => Number(item) & 0xff) : [];
  const rawText = String(payloadText ?? "");
  const rawHex = Buffer.from(bytes).toString("hex").toUpperCase();
  const isNfc = Boolean(mifare?.uid?.length);
  const parsedSticker = isNfc ? null : parseWnySticker(rawText);
  const format = isNfc ? "mifare" : parsedSticker ? "qrcode_wny" : "qrcode_unknown";
  const kind = isNfc ? "NFC" : parsedSticker ? "QR" : "BARCODE";
  const purpose = isNfc ? "USER_NFC" : parsedSticker ? "STICKER" : "DRUG_BARCODE";
  const value = isNfc
    ? Buffer.from(mifare.uid).toString("hex").toUpperCase()
    : rawText;

  return {
    eventId: crypto.randomUUID(),
    kioskCode: KIOSK_CODE,
    kind,
    // Explicit filter keys for Core consumers. `kind`/`format` are retained
    // for backwards compatibility, while these fields describe both the
    // physical encoding and the business meaning of the scan.
    scanType: kind,
    scanPurpose: purpose,
    format,
    value,
    parsed: parsedSticker || {
      value,
      uid: isNfc ? value : undefined,
      header: isNfc ? mifare.header || [] : undefined,
      rest: isNfc ? mifare.rest || [] : undefined,
    },
    raw: {
      text: rawText,
      bytes,
      hex: rawHex,
    },
    scannedAt: new Date().toISOString(),
    source: {
      channel: "qr-nfc",
      portPath: portPath || null,
      baudRate: SERIAL_QR_NFC_BAUD_RATE,
      agent: "vending-3d-ctl",
    },
  };
}
