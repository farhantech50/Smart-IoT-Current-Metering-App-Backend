import { Router } from "express";
import { getDeviceHistory, getMetersSummary } from "./controllers/meter.controller.js";

const router = Router();

// Meter telemetry & energy history routes
router.get("/api/meters/summary", getMetersSummary);
router.get("/api/meters/:floor/:meter/history", getDeviceHistory);

export default router;
