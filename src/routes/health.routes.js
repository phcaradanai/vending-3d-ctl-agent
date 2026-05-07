import { Router } from "express";
import { healthController } from "../controllers/serial.controller.js";

const healthRouter = Router();

healthRouter.get("/health", healthController);

export default healthRouter;
