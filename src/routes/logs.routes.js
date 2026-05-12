import { Router } from "express";
import { getLogCategoryController, listLogsController } from "../controllers/logs.controller.js";
import { requireLogViewAccess } from "../middleware/logViewAuth.middleware.js";

const logsRouter = Router();

logsRouter.get("/logs", requireLogViewAccess, listLogsController);
logsRouter.get("/logs/:category", requireLogViewAccess, getLogCategoryController);

export default logsRouter;
