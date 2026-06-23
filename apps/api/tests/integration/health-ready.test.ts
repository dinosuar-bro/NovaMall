import request from "supertest";
import type { RowDataPacket } from "mysql2/promise";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { createPoolFromEnv } from "../../src/db/pool.js";
import { MysqlHealthRepository } from "../../src/modules/health/health.repository.js";

const pool = createPoolFromEnv({
  DATABASE_URL: process.env.TEST_DATABASE_URL
    ?? "mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test"
});

interface EncryptionModeRow extends RowDataPacket {
  mode: string;
}

describe("真实数据库健康检查", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("新连接设置 AES-256-CBC 加密模式", async () => {
    const [rows] = await pool.query<EncryptionModeRow[]>(
      "SELECT @@session.block_encryption_mode AS mode"
    );
    expect(rows[0]?.mode).toBe("aes-256-cbc");
  });

  it("ready 基于数据库连接和迁移状态返回 200", async () => {
    await request(createApp({ healthRepository: new MysqlHealthRepository(pool) }))
      .get("/api/v1/health/ready")
      .expect(200, {
        success: true,
        data: { status: "ready" }
      });
  });
});
