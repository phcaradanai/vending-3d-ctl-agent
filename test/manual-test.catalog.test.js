import test from "node:test";
import assert from "node:assert/strict";
import { MANUAL_TEST_COMMANDS, MANUAL_TEST_FLOWS, getManualTestCatalog } from "../src/manual-test/commandCatalog.js";

test("manual test catalog exposes unique command ids and API paths", () => {
  const ids = new Set();
  for (const command of MANUAL_TEST_COMMANDS) {
    assert.equal(typeof command.id, "string");
    assert.equal(ids.has(command.id), false, `duplicate command id: ${command.id}`);
    ids.add(command.id);
    assert.match(command.endpoint, /^\/api\/v1\//);
    assert.match(command.method, /^(GET|POST)$/);
    assert.equal(Array.isArray(command.controls), true);
    assert.equal(typeof command.protected, "boolean");
  }
});

test("command control paths exist in default bodies", () => {
  for (const command of MANUAL_TEST_COMMANDS) {
    if (command.defaultBody === null) {
      assert.equal(command.controls.length, 0, `${command.id} has controls without body`);
      continue;
    }

    for (const control of command.controls) {
      let cursor = command.defaultBody;
      for (const key of control.path) {
        assert.notEqual(cursor, undefined, `${command.id} missing ${control.path.join(".")}`);
        assert.notEqual(cursor, null, `${command.id} missing ${control.path.join(".")}`);
        cursor = cursor[key];
      }
      assert.notEqual(cursor, undefined, `${command.id} missing ${control.path.join(".")}`);
    }
  }
});

test("flows reference existing commands and use safe default mode", () => {
  const commandIds = new Set(MANUAL_TEST_COMMANDS.map((command) => command.id));
  assert.ok(MANUAL_TEST_FLOWS.some((flow) => flow.id === "preflight"));

  for (const flow of MANUAL_TEST_FLOWS) {
    assert.ok(flow.steps.length > 0, `${flow.id} has no steps`);
    for (const step of flow.steps) {
      assert.ok(commandIds.has(step.commandId), `${flow.id} references ${step.commandId}`);
    }
  }

  const preflight = MANUAL_TEST_FLOWS.find((flow) => flow.id === "preflight");
  assert.equal(preflight.requiresExecuteConfirmation, false);
  assert.deepEqual(
    preflight.steps.map((step) => step.commandId),
    ["health", "jobQueue"]
  );
});

test("catalog can be serialized for /manual-test/commands.json", () => {
  const catalog = getManualTestCatalog();
  const serialized = JSON.parse(JSON.stringify(catalog));
  assert.equal(serialized.commands.length, MANUAL_TEST_COMMANDS.length);
  assert.equal(serialized.flows.length, MANUAL_TEST_FLOWS.length);
});
