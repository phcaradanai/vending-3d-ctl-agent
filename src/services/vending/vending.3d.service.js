import {
  sy600ConveyorControl,
  sy600LiftControl,
  sy600MicroStepDispense,
  sy600OutputDoorControl,
  sy600PickupDoorControl,
} from "../sy600.service.js";
import { logAgent } from "../../logger/logAgent.js";

/** `sy600LiftControl` special targets for the delivery/output position of each door (see ADM-VENDIND-3DOOR.xlsx, cmd 0xC3). */
const LIFT_DELIVERY_TARGET_BY_DOOR = { 1: 0x55, 2: 0x56, 3: 0x57 };

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
 * tray) before a single delivery pass moves everything collected to the
 * output door → conveyor → pickup door.
 *
 * Every step's real response (via the fixed `sy600.service.js` frame
 * matching) is recorded in `steps`; the order aborts on the first failed
 * step instead of continuing to command hardware whose prior step didn't
 * actually confirm success.
 *
 * @param {{ prescriptionNo: string, items: Array<{ layer: number, channelStart: number, channelEnd: number, qty?: number }>, doorNo?: 1|2|3 }} params
 */
export async function dispenseOrder({ prescriptionNo, items, doorNo }) {
  const validatedItems = ensureItems(items);
  const validatedDoorNo = ensureDoorNo(doorNo);
  const deliveryTarget = LIFT_DELIVERY_TARGET_BY_DOOR[validatedDoorNo];

  const steps = [];
  const startedAt = new Date().toISOString();

  try {
    for (const item of validatedItems) {
      await runStep(steps, "lift", { layer: item.layer }, () =>
        sy600LiftControl({ target: item.layer })
      );
      await runStep(
        steps,
        "dispense",
        {
          layer: item.layer,
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
    // Pickup door auto-closes on the device once the item is taken (0xC7 spec).
    // The output door is our own cleanup so the chute isn't left open.
    await runStep(steps, "output-door-close", { doorNo: validatedDoorNo }, () =>
      sy600OutputDoorControl({ action: 0, doorNo: validatedDoorNo })
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
