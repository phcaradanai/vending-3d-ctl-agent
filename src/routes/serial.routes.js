import { Router } from "express";
import {
    writeNavigationLightsSerialNoWaitController,
    writeNavigationLightsSerialController,
    writeVendingSerialController,
} from "../controllers/serial.controller.js";
import { SERIAL_API_TIMEOUT_MS } from "../config/env.js";
import {
    validateSerialWrite,
    validateSerialWriteNavigationLights,
} from "../middleware/validateSerialWrite.middleware.js";

const serialRouter = Router();

function setVendingWriteApiTimeout(req, res, next) {
    req.setTimeout(SERIAL_API_TIMEOUT_MS);
    res.setTimeout(SERIAL_API_TIMEOUT_MS, () => {
        if (!res.headersSent) {
            res.status(504).json({
                error: "Request timeout",
                details: `API timeout after ${SERIAL_API_TIMEOUT_MS} ms`,
            });
        }
    });
    next();
}

serialRouter.post(
    "/serial/vending/write",
    /*
        {
    // "data": "ee01aabbccddc30002020053a6"
    // "data": "ee01aabbccddc30002000052c6" // ลิฟกลับจุดเริ่อมต้น
    // "data": "ee01aabbccddc3000201005356" // ลิฟขึ้นชั้น 1 บน
    "data": "ee01aabbccddc3000205005196" // ลิฟขึ้นชั้น 5 ล่าง
    // "data": "7b22616374223a226c6564222c22636d64223a5b312c3136352c302c302c3235352c315d7d0a"
}
    {
    */

    setVendingWriteApiTimeout,
    validateSerialWrite,
    writeVendingSerialController
);
serialRouter.post(
    "/serial/navigation-lights/write",
    //   setNavigationLightsWriteApiTimeout,
    /*

    {
      "data": {"act":"led","cmd":[1,165,0,0,0,1]}
      // "data":{"act":"led","cmd":[1,165,128,0,0,1]}
    }
    */
    validateSerialWriteNavigationLights,
    writeNavigationLightsSerialController
);
serialRouter.post(
    "/serial/navigation-lights/write-no-wait", //  ใช้เส้นี้เป็นหลัก
    /*

    {
      "data": {"act":"led","cmd":[1,165,0,0,0,1]}
      // "data":{"act":"led","cmd":[1,165,128,0,0,1]}
    }
    */
    validateSerialWriteNavigationLights,
    writeNavigationLightsSerialNoWaitController
);

export default serialRouter;
