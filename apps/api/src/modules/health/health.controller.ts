import type { RequestHandler } from "express";

import type { HealthService } from "./health.service.js";

export class HealthController {
  constructor(private readonly service: HealthService) {}

  live: RequestHandler = (_request, response) => {
    response.json({ success: true, data: this.service.live() });
  };

  ready: RequestHandler = async (_request, response, next) => {
    try {
      response.json({ success: true, data: await this.service.ready() });
    } catch (error) {
      next(error);
    }
  };
}
