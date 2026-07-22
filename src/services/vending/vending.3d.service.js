import {
  sy600ConveyorControl,
  sy600LiftControl,
  sy600MicroStepDispense,
  sy600GetInfraredStatus,
  sy600OutputDoorControl,
  sy600PickupDoorControl,
} from "../sy600.service.js";
import {
  PICKUP_CONFIRMATION_POLL_MS,
  PICKUP_CONFIRMATION_TIMEOUT_MS,
} from "../../config/env.js";
import { logAgent } from "../../logger/logAgent.js";

/** `sy600LiftControl` special targets for the delivery/output position of each door (see ADM-VENDIND-3DOOR.xlsx, cmd 0xC3). */
const LIFT_DELIVERY_TARGET_BY_DOOR = { 1: 0x55, 2: 0x56, 3: 0x57 };
const PICKUP_CONFIRMATION_SENSOR_TYPE = 0;
let dispenseQueueTail = Promise.resolve();

function ensureItems(items) {
  if (!Array.isArray(items) || !items.length) {
    const error = new Error('"items" must be a non-empty array of { layer, channelStart, channelEnd, qty }');
    error.status = 400;
    throw error;
  }
  return items.map((item, index) => {
    if (!item || typeof item !== "object") {
      const error = new Error(`items[${index}] must be an object`);
      error.status = 400;
      throw error;
    }
    // 1-indexed at this API boundary (matches how a floor/channel is spoken about
    // physically); converted per-command below since 0xC3 and 0xC4 don't agree
    // on indexing at the wire level.
    for (const field of ["layer", "channelStart", "channelEnd"]) {
      if (!Number.isInteger(item[field]) || item[field] < 1) {
        const error = new Error(`items[${index}].${field} must be an integer >= 1 (1-indexed)`);
        error.status = 400;
        throw error;
      }
    }
    return item;
  });
}

function ensureDoorNo(doorNo) {
  const value = doorNo === undefined || doorNo === null ? 1 : doorNo;
  if (!LIFT_DELIVERY_TARGET_BY_DOOR[value]) {
    const error = new Error(`"doorNo" must be one of ${Object.keys(LIFT_DELIVERY_TARGET_BY_DOOR).join(", ")}`);
    error.status = 400;
    throw error;
  }
  return value;
}

/**
 * Keep the physical order explicit at the agent boundary as a second line of
 * defence for callers other than Core: highest shelf first, then lower ones.
 * The sort is stable, so allocations on the same shelf retain their input
 * order.
 */
export function orderItemsForDispense(items) {
  return [...items].sort((left, right) => right.layer - left.layer);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until the pickup compartment's drop sensor has seen the item and then
 * reports it removed. C7 opens the door and the cabinet closes it after the
 * user takes the item; the explicit close command below makes the closed-door
 * acknowledgement part of the transaction before the next sticker starts.
 */
export async function waitForPickupConfirmation({
  doorNo,
  timeoutMs = PICKUP_CONFIRMATION_TIMEOUT_MS,
  pollMs = PICKUP_CONFIRMATION_POLL_MS,
  readSensor = sy600GetInfraredStatus,
  closeDoor = sy600PickupDoorControl,
}) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let itemDetected = false;
  let pollCount = 0;

  while (Date.now() < deadline) {
    const sensor = await readSensor({ sensorType: PICKUP_CONFIRMATION_SENSOR_TYPE });
    pollCount += 1;
    const blocked = sensor?.result?.blocked === true;
    if (blocked) {
      itemDetected = true;
    } else if (itemDetected) {
      const close = await closeDoor({ action: 0, doorNo });
      const doorState = close?.result?.doorState;
      if (!close?.success || doorState !== "closed") {
        const error = new Error(`pickup door ${doorNo} did not confirm closed after item removal`);
        error.status = 502;
        error.doorState = doorState ?? null;
        throw error;
      }
      return {
        success: true,
        result: {
          confirmed: true,
          sensorType: PICKUP_CONFIRMATION_SENSOR_TYPE,
          itemDetected: true,
          itemRemoved: true,
          doorState,
          pollCount,
          waitedMs: Math.max(0, Date.now() - startedAt),
        },
      };
    }
    await sleep(pollMs);
  }

  const error = new Error(
    `pickup confirmation timed out after ${timeoutMs} ms: item was not removed from door ${doorNo}`
  );
  error.status = 504;
  error.doorNo = doorNo;
  error.pollCount = pollCount;
  error.itemDetected = itemDetected;
  throw error;
}

/**
 * Run one physical step, recording it in `steps` regardless of outcome so a
 * failed/aborted order still reports exactly how far it got and why — the
 * caller (HTTP layer) needs the full step trail, not just a final boolean.
 */
async function runStep(steps, phase, meta, task) {
  try {
    const result = await task();
    steps.push({
      phase,
      ...meta,
      success: true,
      result: result.result ?? null,
      txHex: result.txHex,
      response: result.response,
    });
    return result;
  } catch (error) {
    steps.push({
      phase,
      ...meta,
      success: false,
      error: {
        message: error.message,
        status: error.status ?? 500,
        asyncError: error.asyncError ?? null,
      },
    });
    throw error;
  }
}

/**
 * Full pick-and-deliver flow for a prescription/order spanning one or more
 * layers — e.g. 5 items split across layer 4, layer 3, layer 2. Each item is
 * picked in sequence (lift → layer, then micro-step dispense onto the lift
 * tray) before a single delivery pass moves everything collected through the
 * fixed cabinet sequence: lift → output-door-open (inner) → forward conveyor
 * → pickup-door-open (outer) → output-door-close (inner).
 *
 * Every step's real response (via the fixed `sy600.service.js` frame
 * matching) is recorded in `steps`; the order aborts on the first failed
 * step instead of continuing to command hardware whose prior step didn't
 * actually confirm success.
 *
 * @param {{ prescriptionNo: string, items: Array<{ allocationId?: string, layer: number, channelStart: number, channelEnd: number, qty?: number }>, doorNo?: 1|2|3 }} params
 */
async function dispenseOrderUnlocked({ prescriptionNo, items, doorNo }) {
  const validatedItems = orderItemsForDispense(ensureItems(items));
  const validatedDoorNo = ensureDoorNo(doorNo);
  const deliveryTarget = LIFT_DELIVERY_TARGET_BY_DOOR[validatedDoorNo];

  const steps = [];
  const startedAt = new Date().toISOString();

  try {
    for (const item of validatedItems) {
      const itemMeta = {
        layer: item.layer,
        ...(item.allocationId ? { allocationId: item.allocationId } : {}),
      };
      await runStep(steps, "lift", itemMeta, () =>
        sy600LiftControl({ target: item.layer })
      );
      await runStep(
        steps,
        "dispense",
        {
          ...itemMeta,
          channelStart: item.channelStart,
          channelEnd: item.channelEnd,
          qty: item.qty ?? 1,
        },
        () =>
          // 0xC4 layer/channel are 0-indexed at the device — confirmed against real
          // hardware 2026-07-08: requesting layer=1, channel=1-3 physically fired
          // layer 2, channel 2-4. 0xC3 (lift, above) is 1-indexed and unaffected —
          // the two commands do not share an indexing convention.
          sy600MicroStepDispense({
            layer: item.layer - 1,
            channelStart: item.channelStart - 1,
            channelEnd: item.channelEnd - 1,
            repeat: item.qty ?? 1,
          })
      );
    }

    await runStep(steps, "lift-to-delivery", { doorNo: validatedDoorNo, target: deliveryTarget }, () =>
      sy600LiftControl({ target: deliveryTarget })
    );
    await runStep(steps, "output-door-open", { doorNo: validatedDoorNo }, () =>
      sy600OutputDoorControl({ action: 1, doorNo: validatedDoorNo })
    );
    await runStep(steps, "conveyor", { doorNo: validatedDoorNo }, () =>
      sy600ConveyorControl({ direction: 0, seconds: 0 })
    );
    await runStep(steps, "pickup-door-open", { doorNo: validatedDoorNo }, () =>
      sy600PickupDoorControl({ action: 1, doorNo: validatedDoorNo })
    );
    // The output door is our own cleanup so the chute isn't left open while
    // the user is picking up the item.
    await runStep(steps, "output-door-close", { doorNo: validatedDoorNo }, () =>
      sy600OutputDoorControl({ action: 0, doorNo: validatedDoorNo })
    );
    await runStep(steps, "pickup-confirmation", { doorNo: validatedDoorNo, sensorType: PICKUP_CONFIRMATION_SENSOR_TYPE }, () =>
      waitForPickupConfirmation({ doorNo: validatedDoorNo })
    );

    const completedAt = new Date().toISOString();
    logAgent.sy600({
      event: "sy600.dispenseOrder.complete",
      prescriptionNo,
      doorNo: validatedDoorNo,
      itemCount: validatedItems.length,
      stepCount: steps.length,
    });
    return {
      success: true,
      prescriptionNo,
      doorNo: validatedDoorNo,
      startedAt,
      completedAt,
      steps,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const failedStep = steps[steps.length - 1] ?? null;
    logAgent.sy600({
      event: "sy600.dispenseOrder.failed",
      prescriptionNo,
      doorNo: validatedDoorNo,
      failedAtPhase: failedStep?.phase ?? null,
      message: error.message,
    });
    const orderError = new Error(
      `Dispense order failed at step "${failedStep?.phase ?? "unknown"}": ${error.message}`
    );
    orderError.status = error.status && error.status !== 500 ? error.status : 502;
    orderError.prescriptionNo = prescriptionNo;
    orderError.doorNo = validatedDoorNo;
    orderError.startedAt = startedAt;
    orderError.completedAt = completedAt;
    orderError.steps = steps;
    throw orderError;
  }
}

/**
 * Serialize complete Sticker transactions for this physical cabinet. The
 * serial write queue alone is not enough because two orders could otherwise
 * interleave while the first user still has the pickup door open.
 */
export function dispenseOrder(params) {
  const previous = dispenseQueueTail;
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  dispenseQueueTail = current;

  return previous
    .catch(() => {})
    .then(() => dispenseOrderUnlocked(params))
    .finally(() => release());
}
