import { Router } from "express";
import { writeAdmControlController } from "../controllers/adm.controller.js";
import { validateAdmControl } from "../middleware/validateAdmControl.middleware.js";

const admRouter = Router();

// These commands intentionally use the navigation-lights writer/TTY. The ADM
// board accepts the same JSON-line protocol as the existing LED command.
admRouter.post("/buzzer", validateAdmControl("buzzer"), writeAdmControlController);
admRouter.post("/lock", validateAdmControl("lock"), writeAdmControlController);

export default admRouter;
