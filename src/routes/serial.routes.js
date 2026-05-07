import { Router } from "express";
import {
  writeNavigationLightsSerialController,
  writeVendingSerialController,
} from "../controllers/serial.controller.js";
import { validateSerialWrite } from "../middleware/validateSerialWrite.middleware.js";

const serialRouter = Router();

serialRouter.post(
  "/serial/vending/write",
  validateSerialWrite,
  writeVendingSerialController
);
serialRouter.post(
  "/serial/navigation-lights/write",
  validateSerialWrite,
  writeNavigationLightsSerialController
);

export default serialRouter;
