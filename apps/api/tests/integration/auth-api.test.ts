import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { errorResponseSchema } from "@novamall/shared";

import { createApp } from "../../src/app.js";
import { createPoolFromEnv } from "../../src/db/pool.js";
import { MysqlSessionStore } from "../../src/db/session-store.js";
import { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { hashPassword } from "../../src/modules/auth/password.js";
import { MysqlHealthRepository } from "../../src/modules/health/health.repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test";
const phoneAesKey = "phone-key-with-at-least-32-characters";

const pool = createPoolFromEnv({ DATABASE_URL: databaseUrl });
const authRepository = new AuthRepository(pool, phoneAesKey);
const app = createApp({
  healthRepository: new MysqlHealthRepository(pool),
  authRepository,
  sessionStore: new MysqlSessionStore(pool),
  sessionSecret: "session-secret-with-at-least-32-characters"
});

function readCsrf(body: unknown): string {
  if (
    typeof body === "object"
    && body !== null
    && "data" in body
    && typeof body.data === "object"
    && body.data !== null
    && "csrfToken" in body.data
    && typeof body.data.csrfToken === "string"
  ) {
    return body.data.csrfToken;
  }
  throw new Error("响应中缺少 csrfToken");
}

describe("认证 API", () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM sessions");
    await pool.query("DELETE FROM user_roles");
    await pool.query("DELETE FROM users");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("注册后自动登录，能查询会话并访问 MEMBER 壳", async () => {
    const agent = request.agent(app);
    const csrfResponse = await agent.get("/api/v1/auth/csrf").expect(200);
    const csrfToken = readCsrf(csrfResponse.body);

    const registerResponse = await agent
      .post("/api/v1/auth/register")
      .set("X-CSRF-Token", csrfToken)
      .send({
        username: "api_member",
        password: "StrongPass123!",
        displayName: "接口会员",
        phone: "13800138000"
      })
      .expect(201);
    const rotatedCsrfToken = readCsrf(registerResponse.body);
    expect(rotatedCsrfToken).not.toBe(csrfToken);

    await agent.get("/api/v1/auth/session").expect(200).expect((response) => {
      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            username: "api_member",
            displayName: "接口会员",
            roles: ["MEMBER"]
          },
          csrfToken: rotatedCsrfToken
        }
      });
    });

    await agent.get("/api/v1/member/overview").expect(200, {
      success: true,
      data: { role: "MEMBER", stage: "阶段 1 会员壳已就绪" }
    });
    await agent.get("/api/v1/owner/overview").expect(403);
  });

  it("缺失或错误 CSRF Token 的写请求会被拒绝", async () => {
    const agent = request.agent(app);
    await agent.get("/api/v1/auth/csrf").expect(200);

    await agent.post("/api/v1/auth/register").send({}).expect(403).expect((response) => {
      expect(errorResponseSchema.parse(response.body).error.code).toBe("CSRF_INVALID");
    });
    await agent.post("/api/v1/auth/register").set("X-CSRF-Token", "wrong").send({}).expect(403);
  });

  it("退出后原 Session 失效", async () => {
    const agent = request.agent(app);
    const csrfToken = readCsrf((await agent.get("/api/v1/auth/csrf").expect(200)).body);
    const registerResponse = await agent
      .post("/api/v1/auth/register")
      .set("X-CSRF-Token", csrfToken)
      .send({
        username: "logout_member",
        password: "StrongPass123!",
        displayName: "退出会员",
        phone: "13900139000"
      })
      .expect(201);
    const rotatedCsrfToken = readCsrf(registerResponse.body);

    await agent.post("/api/v1/auth/logout").set("X-CSRF-Token", rotatedCsrfToken).expect(200);
    await agent.get("/api/v1/auth/session").expect(401);
  });

  it("店主账号登录后只能进入 OWNER 壳", async () => {
    const owner = await authRepository.createMember({
      username: "owner_user",
      passwordHash: await hashPassword("StrongPass123!"),
      displayName: "店主用户",
      phone: "13700137000"
    });
    await pool.execute(
      "INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'OWNER'",
      [owner.id]
    );

    const agent = request.agent(app);
    const csrfToken = readCsrf((await agent.get("/api/v1/auth/csrf").expect(200)).body);
    const loginResponse = await agent
      .post("/api/v1/auth/login")
      .set("X-CSRF-Token", csrfToken)
      .send({ username: "owner_user", password: "StrongPass123!" })
      .expect(200);

    expect(loginResponse.body).toMatchObject({
      success: true,
      data: {
        user: {
          username: "owner_user",
          roles: ["MEMBER", "OWNER"]
        }
      }
    });
    await agent.get("/api/v1/owner/overview").expect(200);
    await agent.get("/api/v1/admin/overview").expect(403);
  });

  it("登录失败统一返回 INVALID_CREDENTIALS", async () => {
    const agent = request.agent(app);
    const csrfToken = readCsrf((await agent.get("/api/v1/auth/csrf").expect(200)).body);
    await agent
      .post("/api/v1/auth/login")
      .set("X-CSRF-Token", csrfToken)
      .send({ username: "missing", password: "wrong" })
      .expect(401)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("INVALID_CREDENTIALS");
      });
  });
});
