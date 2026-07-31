import test from "node:test";
import assert from "node:assert/strict";

import { validateAdmControl } from "../src/middleware/validateAdmControl.middleware.js";

function mockRes() {
  const res = { _status: null, _body: null };
  res.status = (code) => {
    res._status = code;
    return { json: (body) => { res._body = body; return res; } };
  };
  return res;
}

test("accepts standard buzzer command", () => {
  const req = { body: { control: "buzzer", cmd: { status: 1, time: 1 } } };
  const res = mockRes();
  let called = false;
  validateAdmControl("buzzer")(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res._status, null);
});

test("accepts custom buzzer command", () => {
  const req = { body: { control: "buzzer", cmd: {
    status: 1, mode: "custom", freq: 1500, timeOn: 80, timeOff: 120, time: 5,
  } } };
  const res = mockRes();
  let called = false;
  validateAdmControl("buzzer")(req, res, () => { called = true; });
  assert.equal(called, true);
});

test("accepts lock command with open duration", () => {
  const req = { body: { control: "lock", cmd: { status: 1, time: 15 } } };
  const res = mockRes();
  let called = false;
  validateAdmControl("lock")(req, res, () => { called = true; });
  assert.equal(called, true);
});

test("rejects wrong control and invalid status", () => {
  for (const body of [
    { control: "lock", cmd: { status: 1, time: 1 } },
    { control: "buzzer", cmd: { status: 2, time: 1 } },
  ]) {
    const req = { body };
    const res = mockRes();
    let called = false;
    validateAdmControl("buzzer")(req, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res._status, 400);
  }
});
