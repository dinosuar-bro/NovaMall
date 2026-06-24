import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { errorResponseSchema } from "@novamall/shared";

import { createApp } from "../../src/app.js";
import { createPoolFromEnv } from "../../src/db/pool.js";
import { MysqlSessionStore } from "../../src/db/session-store.js";
import { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { hashPassword } from "../../src/modules/auth/password.js";
import { MysqlHealthRepository } from "../../src/modules/health/health.repository.js";
import { MerchantApplicationsRepository } from "../../src/modules/merchant-applications/merchant-applications.repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test";
const phoneAesKey = "phone-key-with-at-least-32-characters";
const password = "StrongPass123!";

const pool = createPoolFromEnv({ DATABASE_URL: databaseUrl });
const authRepository = new AuthRepository(pool, phoneAesKey);
const app = createApp({
  healthRepository: new MysqlHealthRepository(pool),
  authRepository,
  merchantApplicationsRepository: new MerchantApplicationsRepository(pool),
  sessionStore: new MysqlSessionStore(pool),
  sessionSecret: "session-secret-with-at-least-32-characters"
});

interface IdRow extends RowDataPacket {
  id: string;
}

interface CountRow extends RowDataPacket {
  count: number;
}

interface AuditRow extends RowDataPacket {
  action: string;
  old_data: string;
  new_data: string;
  actor_user_id: string | null;
  request_id: string | null;
}

interface TestUser {
  id: string;
  username: string;
}

type TestAgent = ReturnType<typeof request.agent>;

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

function readStringPath(body: unknown, path: readonly string[]): string {
  let current: unknown = body;
  for (const part of path) {
    if (
      typeof current !== "object"
      || current === null
      || !(part in current)
    ) {
      throw new Error(`响应中缺少 ${path.join(".")}`);
    }
    current = current[part as keyof typeof current];
  }
  if (typeof current !== "string") {
    throw new Error(`响应字段 ${path.join(".")} 不是字符串`);
  }
  return current;
}

function readRoleCodes(body: unknown): string[] {
  if (
    typeof body === "object"
    && body !== null
    && "data" in body
    && typeof body.data === "object"
    && body.data !== null
    && "user" in body.data
    && typeof body.data.user === "object"
    && body.data.user !== null
    && "roles" in body.data.user
    && Array.isArray(body.data.user.roles)
    && body.data.user.roles.every((role) => typeof role === "string")
  ) {
    return body.data.user.roles;
  }
  throw new Error("响应中缺少 roles");
}

async function createUser(username: string, roles: readonly ("ADMIN" | "OWNER")[] = []): Promise<TestUser> {
  const user = await authRepository.createMember({
    username,
    passwordHash: await hashPassword(password),
    displayName: username,
    phone: `138${String(Math.floor(Math.random() * 10_000_000)).padStart(8, "0")}`
  });
  for (const role of roles) {
    await pool.execute(
      "INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?",
      [user.id, role]
    );
  }
  return { id: user.id, username };
}

async function loginAgent(username: string): Promise<{ agent: TestAgent; csrfToken: string }> {
  const agent = request.agent(app);
  const csrfToken = readCsrf((await agent.get("/api/v1/auth/csrf").expect(200)).body);
  const loginResponse = await agent
    .post("/api/v1/auth/login")
    .set("X-CSRF-Token", csrfToken)
    .send({ username, password })
    .expect(200);
  return { agent, csrfToken: readCsrf(loginResponse.body) };
}

async function submitApplication(
  agent: TestAgent,
  csrfToken: string,
  shopName: string
): Promise<string> {
  const response = await agent
    .put("/api/v1/merchant-applications/me")
    .set("X-CSRF-Token", csrfToken)
    .send({
      shopName,
      shopDescription: `${shopName} 主营社区精选商品和礼盒`
    })
    .expect(200);
  return readStringPath(response.body, ["data", "id"]);
}

describe("商户入驻 API", () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM audit_logs");
    await pool.query("DELETE FROM shops");
    await pool.query("DELETE FROM merchant_applications");
    await pool.query("DELETE FROM sessions");
    await pool.query("DELETE FROM user_roles");
    await pool.query("DELETE FROM users");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("会员可提交并查看自己的申请，待审核时不能重复提交", async () => {
    const member = await createUser("merchant_member_submit");
    const { agent, csrfToken } = await loginAgent(member.username);

    const applicationId = await submitApplication(agent, csrfToken, "星选鲜果铺");
    expect(applicationId).toMatch(/^\d+$/);

    await agent.get("/api/v1/merchant-applications/me").expect(200).expect((response) => {
      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: applicationId,
          shopName: "星选鲜果铺",
          status: "PENDING",
          rejectReason: null
        }
      });
    });

    await agent
      .put("/api/v1/merchant-applications/me")
      .set("X-CSRF-Token", csrfToken)
      .send({
        shopName: "星选第二店",
        shopDescription: "主营社区精选商品和礼盒"
      })
      .expect(409)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("DUPLICATE_APPLICATION");
      });
  });

  it("管理员拒绝后，会员可更新同一申请重新提交", async () => {
    const member = await createUser("merchant_member_retry");
    const admin = await createUser("merchant_admin_reject", ["ADMIN"]);
    const memberSession = await loginAgent(member.username);
    const adminSession = await loginAgent(admin.username);
    const applicationId = await submitApplication(memberSession.agent, memberSession.csrfToken, "星选简餐铺");

    await adminSession.agent
      .post(`/api/v1/admin/merchant-applications/${applicationId}/reject`)
      .set("X-CSRF-Token", adminSession.csrfToken)
      .send({ reason: "店铺简介需要补充主营品类" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          success: true,
          data: {
            id: applicationId,
            status: "REJECTED",
            rejectReason: "店铺简介需要补充主营品类"
          }
        });
      });

    await memberSession.agent
      .put("/api/v1/merchant-applications/me")
      .set("X-CSRF-Token", memberSession.csrfToken)
      .send({
        shopName: "星选简餐铺升级版",
        shopDescription: "主营社区工作日简餐和轻食套餐"
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          success: true,
          data: {
            id: applicationId,
            shopName: "星选简餐铺升级版",
            status: "PENDING",
            rejectReason: null
          }
        });
      });
  });

  it("管理员批准后创建店铺、授予 OWNER，并写入审计日志", async () => {
    const member = await createUser("merchant_member_approve");
    const admin = await createUser("merchant_admin_approve", ["ADMIN"]);
    const memberSession = await loginAgent(member.username);
    const adminSession = await loginAgent(admin.username);
    const applicationId = await submitApplication(memberSession.agent, memberSession.csrfToken, "星选烘焙铺");
    const requestId = "11111111-1111-4111-8111-111111111111";

    await adminSession.agent
      .post(`/api/v1/admin/merchant-applications/${applicationId}/approve`)
      .set("X-CSRF-Token", adminSession.csrfToken)
      .set("X-Request-Id", requestId)
      .send({})
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          success: true,
          data: {
            application: {
              id: applicationId,
              status: "APPROVED"
            },
            shop: {
              name: "星选烘焙铺",
              status: "ACTIVE"
            }
          }
        });
      });

    await memberSession.agent.get("/api/v1/auth/session").expect(200).expect((response) => {
      expect(readRoleCodes(response.body)).toEqual(["MEMBER", "OWNER"]);
    });
    await memberSession.agent.get("/api/v1/owner/shop").expect(200).expect((response) => {
      expect(response.body).toMatchObject({
        success: true,
        data: {
          name: "星选烘焙铺",
          status: "ACTIVE"
        }
      });
    });

    const [auditRows] = await pool.query<AuditRow[]>(
      `SELECT action, old_data, new_data, CAST(actor_user_id AS CHAR) AS actor_user_id, request_id
         FROM audit_logs
        WHERE table_name = 'merchant_applications' AND record_id = ?
        ORDER BY id`,
      [applicationId]
    );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      action: "STATUS_CHANGE",
      actor_user_id: admin.id,
      request_id: requestId
    });
    expect(JSON.stringify(auditRows[0])).not.toContain("phone");
    expect(JSON.stringify(auditRows[0])).not.toContain("password");
  });

  it("非管理员不能查询或审核申请", async () => {
    const member = await createUser("merchant_member_forbidden");
    const { agent, csrfToken } = await loginAgent(member.username);
    const applicationId = await submitApplication(agent, csrfToken, "星选文具铺");

    await agent.get("/api/v1/admin/merchant-applications").expect(403);
    await agent
      .post(`/api/v1/admin/merchant-applications/${applicationId}/approve`)
      .set("X-CSRF-Token", csrfToken)
      .send({})
      .expect(403);
  });

  it("重复和并发审核同一申请只有一个成功", async () => {
    const member = await createUser("merchant_member_conflict");
    const adminOne = await createUser("merchant_admin_conflict_one", ["ADMIN"]);
    const adminTwo = await createUser("merchant_admin_conflict_two", ["ADMIN"]);
    const memberSession = await loginAgent(member.username);
    const adminOneSession = await loginAgent(adminOne.username);
    const adminTwoSession = await loginAgent(adminTwo.username);
    const applicationId = await submitApplication(memberSession.agent, memberSession.csrfToken, "星选花艺铺");

    await adminOneSession.agent
      .post(`/api/v1/admin/merchant-applications/${applicationId}/approve`)
      .set("X-CSRF-Token", adminOneSession.csrfToken)
      .send({})
      .expect(200);
    await adminOneSession.agent
      .post(`/api/v1/admin/merchant-applications/${applicationId}/approve`)
      .set("X-CSRF-Token", adminOneSession.csrfToken)
      .send({})
      .expect(409)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("APPLICATION_STATE_CONFLICT");
      });

    const secondMember = await createUser("merchant_member_concurrent");
    const secondMemberSession = await loginAgent(secondMember.username);
    const secondApplicationId = await submitApplication(
      secondMemberSession.agent,
      secondMemberSession.csrfToken,
      "星选茶饮铺"
    );
    const results = await Promise.all([
      adminOneSession.agent
        .post(`/api/v1/admin/merchant-applications/${secondApplicationId}/approve`)
        .set("X-CSRF-Token", adminOneSession.csrfToken)
        .send({}),
      adminTwoSession.agent
        .post(`/api/v1/admin/merchant-applications/${secondApplicationId}/approve`)
        .set("X-CSRF-Token", adminTwoSession.csrfToken)
        .send({})
    ]);

    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it("店名冲突导致批准失败且不授予 OWNER", async () => {
    const firstMember = await createUser("merchant_member_first_shop");
    const secondMember = await createUser("merchant_member_second_shop");
    const admin = await createUser("merchant_admin_shop_conflict", ["ADMIN"]);
    const firstSession = await loginAgent(firstMember.username);
    const secondSession = await loginAgent(secondMember.username);
    const adminSession = await loginAgent(admin.username);
    const firstApplicationId = await submitApplication(firstSession.agent, firstSession.csrfToken, "星选咖啡铺");
    const secondApplicationId = await submitApplication(secondSession.agent, secondSession.csrfToken, "星选咖啡铺");

    await adminSession.agent
      .post(`/api/v1/admin/merchant-applications/${firstApplicationId}/approve`)
      .set("X-CSRF-Token", adminSession.csrfToken)
      .send({})
      .expect(200);
    await adminSession.agent
      .post(`/api/v1/admin/merchant-applications/${secondApplicationId}/approve`)
      .set("X-CSRF-Token", adminSession.csrfToken)
      .send({})
      .expect(409)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("SHOP_NAME_TAKEN");
      });

    const [roleRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS count
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ? AND r.code = 'OWNER'`,
      [secondMember.id]
    );
    const [shopRows] = await pool.query<IdRow[]>(
      "SELECT CAST(id AS CHAR) AS id FROM shops WHERE owner_user_id = ?",
      [secondMember.id]
    );
    expect(roleRows[0]?.count).toBe(0);
    expect(shopRows).toHaveLength(0);
  });
});
