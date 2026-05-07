import { Router } from "express";
// import { validateSerialWrite } from "../middleware/validateSerialWrite.middleware.js";
import { validateDispenserCmd } from "../middleware/validateDispenserCmd.middleware.js";
import { formatDateTime } from "../utils/datetime.util.js";
import { VENDING_CODE,
    DOOR_TYPE_STANDBY,
    DOOR_TYPE_NOW,
 } from "../config/env.js";


const drugDispenserRouter = Router();


drugDispenserRouter.post("/vending/drugDispenser", validateDispenserCmd, (req, res) => {
    const payload = req.body;
    console.log(payload);
    const now = new Date();
    const tStart = formatDateTime(now);
    // สมมติว่า process ใช้เวลาสั้น ๆ ใช้เวลาปัจจุบันทั้งคู่ได้
    const tStop = formatDateTime(new Date());
    const ts = formatDateTime(new Date());

    // const data = {
    //     ts: ts,
    //     timeProcess: {
    //         tStart: tStart,
    //         tStop: tStop,
    //     },
    // };

    let response = {
        ok: 1,
        data: {
            ts: ts,
            timeProcess: {
                tStart: tStart,
                tStop: tStop,
            },
            prescriptionNo: payload.prescription,
            type: payload.type,
            status: "pending",
            door: DOOR_TYPE_STANDBY[0],
            vendingCode: VENDING_CODE,
            raw: payload
        }
    }
    console.log(response);
    res.json(response);
    // return res.json({ message: "Drug dispense successful" });
});

export default drugDispenserRouter;