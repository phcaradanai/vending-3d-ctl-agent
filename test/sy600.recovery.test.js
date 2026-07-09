import test from "node:test";
import assert from "node:assert/strict";

import { tryRecoverInvertedRx } from "../src/services/sy600.service.js";

// Every RX below is a real capture from the field machine's events-serial log
// (inverted-RX wiring fault, see docs/deploy-registry.md).

test("recovers lift 0xC3 ack: status + position", () => {
  const cases = [
    { rx: "007FFEFEFEF2FCF6FEFA2A6A00", pos: 1 },
    { rx: "007FFEFEFEF2FCF6FEF6EAE600", pos: 2 },
    { rx: "007FFEFEFEF2FCF6FEF2AA6200", pos: 3 },
    { rx: "007FFEFEFEF2FCF6FEEE6AFE00", pos: 4 },
    // pickup position 0x55 aliases to 0x15 (top 2 bits lost)
    { rx: "007FFEFEFEF2FCF6FEAA42AE00", pos: 0x55 & 0x3f },
  ];
  for (const { rx, pos } of cases) {
    const frame = tryRecoverInvertedRx(rx, 0xc3);
    assert.ok(frame, `recovery failed for ${rx}`);
    assert.equal(frame.recovered, true);
    assert.equal(frame.command, 0xc3);
    assert.equal(frame.dataBytes[0], 0x00, "status should be success");
    assert.equal(frame.dataBytes[1], pos, `position mismatch for ${rx}`);
  }
});

test("recovers micro-step 0xC4 ack", () => {
  const frame = tryRecoverInvertedRx("007FFEFEFEEEFCFAFECEE40100", 0xc4);
  assert.ok(frame);
  assert.equal(frame.command, 0xc4);
  assert.equal(frame.dataBytes[0], 0x00, "result should be success");
});

test("recovers door 0xC5 ack: opened vs closed", () => {
  const opened = tryRecoverInvertedRx("007FFEFEFEEAFCFAFA564C00", 0xc5);
  assert.ok(opened);
  assert.equal(opened.dataBytes[0], 1, "1 = Opened");

  const closed = tryRecoverInvertedRx("007FFEFEFEEAFCFAF6965400", 0xc5);
  assert.ok(closed);
  assert.equal(closed.dataBytes[0], 2, "2 = Closed");
});

test("recovers microswitch 0x39 status bytes", () => {
  const frame = tryRecoverInvertedRx("007FFEFEFE1AFEE6EAFAFEFEFEFA621C00", 0x39);
  assert.ok(frame);
  assert.equal(frame.command, 0x39);
  assert.equal(frame.dataBytes[0], 5, "microswitch count");
  assert.deepEqual(frame.dataBytes.slice(1), [1, 0, 0, 0, 1]);
});

test("rejects buffers that are not the inverted-RX signature", () => {
  // clean/normal frame must NOT be routed through recovery
  assert.equal(tryRecoverInvertedRx("FF01AABBCCDDC30002000155AA", 0xc3), null);
  // random garbage
  assert.equal(tryRecoverInvertedRx("0011223344556677889900", 0xc3), null);
  // command mismatch: C3 capture but expecting C5
  assert.equal(tryRecoverInvertedRx("007FFEFEFEF2FCF6FEFA2A6A00", 0xc5), null);
  // too short
  assert.equal(tryRecoverInvertedRx("007FFE00", 0xc3), null);
});
