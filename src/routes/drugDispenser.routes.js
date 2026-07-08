import { Router } from "express";
import { validateDispenserCmd } from "../middleware/validateDispenserCmd.middleware.js";
import { formatDateTime } from "../utils/datetime.util.js";
import { VENDING_CODE, DOOR_TYPE_STANDBY } from "../config/env.js";
import { dispenseOrder } from "../services/vending/vending.3d.service.js";

const drugDispenserRouter = Router();

async function drugDispenserController(req, res, next) {
  const payload = req.body;
  const tStart = formatDateTime(new Date());

  try {
    const result = await dispenseOrder({
      prescriptionNo: payload.prescription,
      items: payload.items,
      doorNo: payload.doorNo ?? DOOR_TYPE_STANDBY[0],
    });

    return res.json({
      ok: 1,
      data: {
        ts: formatDateTime(new Date()),
        timeProcess: { tStart, tStop: formatDateTime(new Date()) },
        prescriptionNo: result.prescriptionNo,
        type: payload.type,
        status: result.success ? "success" : "failed",
        door: result.doorNo,
        vendingCode: VENDING_CODE,
        steps: result.steps,
      },
    });
  } catch (error) {
    if (Array.isArray(error.steps)) {
      return res.status(error.status || 502).json({
        ok: 0,
        data: {
          ts: formatDateTime(new Date()),
          timeProcess: { tStart, tStop: formatDateTime(new Date()) },
          prescriptionNo: error.prescriptionNo ?? payload.prescription,
          type: payload.type,
          status: "failed",
          door: error.doorNo ?? null,
          vendingCode: VENDING_CODE,
          steps: error.steps,
          error: error.message,
        },
      });
    }
    return next(error);
  }
}

drugDispenserRouter.post("/vending/drugDispenser", validateDispenserCmd, drugDispenserController);

export default drugDispenserRouter;
