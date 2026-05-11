import { Router } from "express";
import { validateDispenserCmd } from "../middleware/validateDispenserCmd.middleware.js";
import { formatDateTime } from "../utils/datetime.util.js";
import {
  VENDING_CODE,
  DOOR_TYPE_STANDBY,
  DOOR_TYPE_NOW,
} from "../config/env.js";

const drugDispenserRouter = Router();

async function drugDispenserController(req, res) {
  const payload = req.body;
  console.log(payload);
  const now = new Date();
  const tStart = formatDateTime(now);
  const tStop = formatDateTime(new Date());
  const ts = formatDateTime(new Date());

  const response = {
    ok: 1,
    data: {
      ts,
      timeProcess: {
        tStart,
        tStop,
      },
      prescriptionNo: payload.prescription,
      type: payload.type,
      status: "pending",
      door: DOOR_TYPE_STANDBY[0],
      vendingCode: VENDING_CODE,
      raw: payload,
    },
  };
  console.log(response);
  return res.json(response);
}

drugDispenserRouter.post("/vending/drugDispenser", validateDispenserCmd, drugDispenserController);

export default drugDispenserRouter;
