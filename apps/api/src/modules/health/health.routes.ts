import { Router } from "express";

import { HealthController } from "./health.controller.js";
import type { HealthRepository } from "./health.repository.js";
import { HealthService } from "./health.service.js";

export function createHealthRouter(repository: HealthRepository): Router {
  const router = Router();
  const controller = new HealthController(new HealthService(repository));

  router.get("/live", controller.live);
  router.get("/ready", controller.ready);

  return router;
}
