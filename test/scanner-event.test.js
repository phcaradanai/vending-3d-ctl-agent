import test from "node:test";
import assert from "node:assert/strict";
import { buildScannerEvent } from "../src/services/scanner-event.js";

test("canonical WNY QR event carries kiosk, parsed and raw values", () => {
  const event = buildScannerEvent({
    payloadText: "fa97dbc9-3e28-4978-9588-9008bd86209f_00010001_1000174_2_OUT_20260722120000",
    payloadBytes: [0x61, 0x62],
    portPath: "/dev/ttyS1",
  });
  assert.equal(event.kind, "QR");
  assert.equal(event.scanType, "QR");
  assert.equal(event.scanPurpose, "STICKER");
  assert.equal(event.format, "qrcode_wny");
  assert.equal(event.kioskCode.length > 0, true);
  assert.equal(event.parsed.prescription_id, "fa97dbc9-3e28-4978-9588-9008bd86209f");
  assert.deepEqual(event.raw.bytes, [0x61, 0x62]);
  assert.equal(event.raw.hex, "6162");
});

test("canonical Mifare event exposes UID as readable value without dropping raw bytes", () => {
  const event = buildScannerEvent({
    payloadText: "0201010900AABBCCDD",
    payloadBytes: [2, 1, 1, 9, 0, 0xaa, 0xbb, 0xcc, 0xdd],
    portPath: "/dev/ttyS1",
    mifare: { header: [2, 1, 1, 9, 0], uid: [0xaa, 0xbb, 0xcc, 0xdd], rest: [] },
  });
  assert.equal(event.kind, "NFC");
  assert.equal(event.scanType, "NFC");
  assert.equal(event.scanPurpose, "USER_NFC");
  assert.equal(event.value, "AABBCCDD");
  assert.equal(event.raw.hex, "0201010900AABBCCDD");
  assert.deepEqual(event.parsed.uid, "AABBCCDD");
});
