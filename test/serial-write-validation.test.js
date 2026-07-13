import test from "node:test";
import assert from "node:assert/strict";

import { validateSerialWrite } from "../src/middleware/validateSerialWrite.middleware.js";

/**
 * Create a mock Express response that captures status/JSON calls.
 * Returns the `res` object; the caller inspects `res._status` and `res._body`.
 */
function mockRes() {
  const res = {
    _status: null,
    _body: null,
    jsonCalled: false,
  };
  res.status = (code) => {
    res._status = code;
    return {
      json: (body) => {
        res._body = body;
        res.jsonCalled = true;
        return res;
      },
    };
  };
  return res;
}

function mockReq(body) {
  return { body };
}

// ---------------------------------------------------------------------------
// Missing / blank "data" field
// ---------------------------------------------------------------------------

test("rejects missing data field with 400", async () => {
  const req = mockReq({});
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false, "next() must not be called for invalid input");
  assert.equal(res._status, 400);
  assert.ok(res._body, "response body must be present");
  assert.ok(res._body.error, "response must include error message");
});

test("rejects empty string data with 400", async () => {
  const req = mockReq({ data: "" });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 400);
  assert.ok(res._body.error);
});

test("rejects whitespace-only string data with 400", async () => {
  const req = mockReq({ data: "   \t \n  " });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 400);
  assert.ok(res._body.error);
});

test("rejects non-string data with 400", async () => {
  const req = mockReq({ data: 12345 });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 400);
});

// ---------------------------------------------------------------------------
// Odd-length hex after stripping whitespace
// ---------------------------------------------------------------------------

test("rejects odd-length hex with 400", async () => {
  const req = mockReq({ data: "ee01a" });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 400);
  assert.ok(res._body.error);
});

test("rejects odd-length hex with embedded whitespace with 400", async () => {
  // After stripping spaces: "ee01a" — odd length
  const req = mockReq({ data: "ee 01 a" });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 400);
});

// ---------------------------------------------------------------------------
// Non-hex content
// ---------------------------------------------------------------------------

test("rejects non-hex characters with 400", async () => {
  const req = mockReq({ data: "gg01aabb" });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 400);
  assert.ok(res._body.error);
});

test("rejects mixed hex+non-hex characters with 400", async () => {
  const req = mockReq({ data: "ee01aabbZZcc" });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 400);
});

test("rejects hex string containing control characters with 400", async () => {
  // Tab is not whitespace for [0-9a-fA-F] — it stays after .replace(/\s+/g, "")
  // so "ee01\taabb" becomes "ee01aabb" which IS valid. Use a genuinely non-hex
  // non-whitespace character like 'g'.
  const req = mockReq({ data: "ee01gaabb" });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 400);
});

// ---------------------------------------------------------------------------
// Valid hex payloads (mixed case, whitespace-separated, plain)
// ---------------------------------------------------------------------------

test("accepts valid even-length lowercase hex and calls next", async () => {
  const req = mockReq({ data: "ee01aabbccddc3000205005196" });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true, "next() must be called for valid hex");
  assert.equal(res._status, null, "response must not be sent for valid input");
});

test("accepts valid even-length uppercase hex and calls next", async () => {
  const req = mockReq({ data: "EE01AABBCCDDC3000205005196" });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("accepts valid mixed-case hex and calls next", async () => {
  const req = mockReq({ data: "Ee01AaBbCcDdC3000205005196" });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("accepts whitespace-separated valid hex and calls next", async () => {
  const req = mockReq({ data: "ee01 aabb ccdd c300 0205 0051 96" });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("accepts tab/newline separated valid hex and calls next", async () => {
  const req = mockReq({ data: "ee01\taabb\nccdd\r\nc300" });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("accepts single hex byte and calls next", async () => {
  const req = mockReq({ data: "FF" });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("accepts leading/trailing whitespace with valid inner hex", async () => {
  const req = mockReq({ data: "  ee01aabb  " });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("rejects null data with 400", async () => {
  const req = mockReq({ data: null });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 400);
});

test("rejects undefined data with 400", async () => {
  const req = mockReq({ data: undefined });
  const res = mockRes();
  let nextCalled = false;
  await validateSerialWrite(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res._status, 400);
});
