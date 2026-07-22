import test from "node:test";
import assert from "node:assert/strict";

import {
  orderItemsForDispense,
  waitForPickupConfirmation,
} from "../src/services/vending/vending.3d.service.js";

test("orders multi-shelf items from highest shelf to lowest", () => {
  const input = [
    { allocationId: "a1", layer: 1 },
    { allocationId: "a5", layer: 5 },
    { allocationId: "a3", layer: 3 },
    { allocationId: "a5b", layer: 5 },
  ];

  const ordered = orderItemsForDispense(input);

  assert.deepEqual(
    ordered.map((item) => item.allocationId),
    ["a5", "a5b", "a3", "a1"],
  );
  assert.deepEqual(input.map((item) => item.allocationId), ["a1", "a5", "a3", "a5b"]);
});

test("waits for pickup sensor removal and confirms the door closed", async () => {
  const sensorStates = [true, true, false];
  const closeCalls = [];
  const result = await waitForPickupConfirmation({
    doorNo: 1,
    timeoutMs: 100,
    pollMs: 1,
    readSensor: async () => ({ result: { blocked: sensorStates.shift() } }),
    closeDoor: async (request) => {
      closeCalls.push(request);
      return { success: true, result: { doorState: "closed" } };
    },
  });

  assert.equal(result.result.confirmed, true);
  assert.equal(result.result.itemRemoved, true);
  assert.deepEqual(closeCalls, [{ action: 0, doorNo: 1 }]);
});
