import { AppError } from "../../errors/app-error.js";
import type { HealthRepository } from "./health.repository.js";

export class HealthService {
  constructor(private readonly repository: HealthRepository) {}

  live(): { status: "live" } {
    return { status: "live" };
  }

  async ready(): Promise<{ status: "ready" }> {
    try {
      await this.repository.assertReady();
      return { status: "ready" };
    } catch {
      throw new AppError(503, "SERVICE_NOT_READY", "服务尚未就绪");
    }
  }
}
