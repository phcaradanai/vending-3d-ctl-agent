import { Router } from "express";
import {
  writeNavigationLightsSerialController,
  writeVendingSerialController,
} from "../controllers/serial.controller.js";
import { SERIAL_API_TIMEOUT_MS } from "../config/env.js";
import { validateSerialWrite } from "../middleware/validateSerialWrite.middleware.js";

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
  setVendingWriteApiTimeout,
  validateSerialWrite,
  writeVendingSerialController
);
serialRouter.post(
  "/serial/navigation-lights/write",
  validateSerialWrite,
  writeNavigationLightsSerialController
);

export default serialRouter;
