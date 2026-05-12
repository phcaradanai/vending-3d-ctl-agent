import { Router } from "express";
import { jobQueueController } from "../controllers/job.controller.js";

const jobRouter = Router();

// GET /api/v1/job/que — serial write queue snapshot (vending / navigation / debug keys)
jobRouter.get("/job/que", jobQueueController);

export default jobRouter;
