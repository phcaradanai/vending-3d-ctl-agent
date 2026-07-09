import test from "node:test";
import assert from "node:assert/strict";

import { finalizeSy600Response } from "../src/services/sy600.service.js";

function frame(command, dataBytes, extra = {}) {
  return {
    start: 0xff,
    version: 0x01,
    addressHex: "AABBCCDD",
    command,
    length: dataBytes.length,
    dataBytes,
    crc16: 0,
    rawHex: "FF01AABBCCDD",
    frameTotal: 11 + dataBytes.length,
    ...extra,
  };
}

test("lift 0xC3 result: success + position", () => {
  const payload = finalizeSy600Response(frame(0xc3, [0x00, 0x03]), [], "EE01");
  assert.equal(payload.success, true);
  assert.deepEqual(payload.result, { success: true, position: 3 });
  assert.ok(payload.response.decoded, "detailed decode kept for compatibility");
});

test("door 0xC5 result: doorState text and failure mapping", () => {
  const opened = finalizeSy600Response(frame(0xc5, [1, 2]), [], "EE01");
  assert.deepEqual(opened.result, { success: true, doorNo: 2, doorState: "opened" });

  const failed = finalizeSy600Response(frame(0xc5, [3, 2]), [], "EE01");
  assert.equal(failed.success, false);
  assert.equal(failed.result.doorState, "open_failed");
});

test("micro-step 0xC4 failure surfaces code + message", () => {
  const payload = finalizeSy600Response(frame(0xc4, [0x09, 0x01]), [], "EE01");
  assert.equal(payload.success, false);
  assert.equal(payload.result.resultCode, 0x09);
  assert.equal(payload.result.message, "Machine busy");
});

test("infrared 0x35 result: blocked boolean + sensorType from context", () => {
  const payload = finalizeSy600Response(frame(0x35, [0x01]), [], "EE01", { sensorType: 4 });
  assert.deepEqual(payload.result, { success: true, sensorType: 4, blocked: true });
});

test("microswitch 0x39 result: switches array with blocked booleans", () => {
  const payload = finalizeSy600Response(frame(0x39, [3, 0, 1, 0]), [], "EE01");
  assert.equal(payload.result.microswitchCount, 3);
  assert.deepEqual(payload.result.switches, [
    { index: 1, blocked: false },
    { index: 2, blocked: true },
    { index: 3, blocked: false },
  ]);
});

test("cabinet 0x4A temperature read: 13-byte field ack decodes telemetry + set-point", () => {
  // Real recovered ack from deploy 10.8.0.44 (see rawHex 007FFEFEFED6FECAFE…):
  // [status, temp:int16, humidity:int16, evapTemp:int16, faults:2B, paramAddr, paramValue, rsv:2B]
  const fieldAck = [0, 0, 55, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0];
  const payload = finalizeSy600Response(frame(0x4a, fieldAck), [], "EE01", {
    cabinetKind: "temperature-read",
  });
  assert.equal(payload.success, true);
  assert.equal(payload.result.currentTempCelsius, 5.5);
  assert.equal(payload.result.humidityPercent, 0);
  assert.equal(payload.result.evaporatorTempCelsius, 0);
  assert.equal(payload.result.setpointCelsius, 4);
  assert.deepEqual(payload.result.sensorFaults, []);
});

test("cabinet 0x4A decodes negative temperature and fault bits", () => {
  // temp = -3.5 °C (0xFFDD = -35 tenths), E1 (cabinet NTC fault) bit set
  const ack = [0, 0xff, 0xdd, 0, 0, 0, 0, 0b10000000, 0, 0x00, 2, 0, 0];
  const payload = finalizeSy600Response(frame(0x4a, ack), [], "EE01", {
    cabinetKind: "temperature-read",
  });
  assert.equal(payload.result.currentTempCelsius, -3.5);
  assert.deepEqual(payload.result.sensorFaults, ["cabinetNtcFault"]);
  assert.equal(payload.result.setpointCelsius, 2);
});

test("cabinet 0x44 status decodes all device flags", () => {
  // [led1, led2, glass, cooling, heating, door, defrost]
  const payload = finalizeSy600Response(frame(0x44, [1, 0, 0, 1, 0, 0, 0]), [], "EE01", {
    cabinetKind: "status",
  });
  assert.equal(payload.result.lights1On, true);
  assert.equal(payload.result.lights2On, false);
  assert.equal(payload.result.compressorCoolingOn, true);
  assert.equal(payload.result.compressorHeatingOn, false);
  assert.equal(payload.result.doorOpen, false);
  assert.equal(payload.result.defrosting, false);
});

test("cabinet 0x4A compressor power reads applied state from param 0x12 echo", () => {
  const ack = [0, 0, 55, 0, 0, 0, 0, 0, 0, 0x12, 1, 0, 0];
  const payload = finalizeSy600Response(frame(0x4a, ack), [], "EE01", {
    cabinetKind: "compressor-power",
    requestedOn: true,
  });
  assert.equal(payload.success, true);
  assert.equal(payload.result.compressorOn, true);
  assert.equal(payload.result.currentTempCelsius, 5.5);
});

test("recovered frame and async errors flagged in result", () => {
  const asyncError = {
    decoded: { errorText: "Conveyor timeout" },
  };
  const payload = finalizeSy600Response(
    frame(0xc6, [0x00], { recovered: true, recoveryNote: "note" }),
    [asyncError],
    "EE01"
  );
  assert.equal(payload.result.recovered, true);
  assert.deepEqual(payload.result.warnings, ["Conveyor timeout"]);
  assert.equal(payload.response.recovered, true);
});
