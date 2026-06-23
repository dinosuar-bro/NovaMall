import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorResponseSchema } from "@novamall/shared";

import { createApp } from "../../src/app.js";
import type { HealthRepository } from "../../src/modules/health/health.repository.js";

const readyRepository: HealthRepository = {
  async assertReady() {
    return Promise.resolve();
  }
};

describe("健康检查", () => {
  it("live 只验证 Express 进程存活", async () => {
    await request(createApp({ healthRepository: readyRepository }))
      .get("/api/v1/health/live")
      .expect(200, {
        success: true,
        data: { status: "live" }
      });
  });

  it("ready 在数据库与迁移可用时返回 200", async () => {
    await request(createApp({ healthRepository: readyRepository }))
      .get("/api/v1/health/ready")
      .expect(200, {
        success: true,
        data: { status: "ready" }
      });
  });

  it("ready 在依赖不可用时返回稳定的 503 错误", async () => {
    const unavailableRepository: HealthRepository = {
      assertReady() {
        return Promise.reject(new Error("database unavailable"));
      }
    };

    const response = await request(createApp({ healthRepository: unavailableRepository }))
      .get("/api/v1/health/ready")
      .expect(503);
    const body = errorResponseSchema.parse(response.body);

    expect(body).toMatchObject({
      success: false,
      error: {
        code: "SERVICE_NOT_READY",
        message: "服务尚未就绪"
      }
    });
    expect(body.error.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain("database unavailable");
  });
});
