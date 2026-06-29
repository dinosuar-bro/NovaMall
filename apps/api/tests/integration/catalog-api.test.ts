import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { errorResponseSchema } from "@novamall/shared";

import { createApp } from "../../src/app.js";
import { createPoolFromEnv } from "../../src/db/pool.js";
import { MysqlSessionStore } from "../../src/db/session-store.js";
import { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { hashPassword } from "../../src/modules/auth/password.js";
import { CatalogRepository } from "../../src/modules/catalog/catalog.repository.js";
import { MysqlHealthRepository } from "../../src/modules/health/health.repository.js";
import { MerchantApplicationsRepository } from "../../src/modules/merchant-applications/merchant-applications.repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test";
const phoneAesKey = "phone-key-with-at-least-32-characters";
const password = "StrongPass123!";
const tinyPng = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfab6d0000000049454e44ae426082",
  "hex"
);
const productPng = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000040000000400802000000250be689000000514944415478daedcf310d0030080030984094201c1953c141d23a684e575cf6e238010101010101010101010101010101010101010101010101010101010101010101010101010101010101817d1f0b6b022205488aab0000000049454e44ae426082",
  "hex"
);

const pool = createPoolFromEnv({ DATABASE_URL: databaseUrl });
const authRepository = new AuthRepository(pool, phoneAesKey);
const app = createApp({
  healthRepository: new MysqlHealthRepository(pool),
  authRepository,
  merchantApplicationsRepository: new MerchantApplicationsRepository(pool),
  catalogRepository: new CatalogRepository(pool, "uploads"),
  sessionStore: new MysqlSessionStore(pool),
  sessionSecret: "session-secret-with-at-least-32-characters"
});

interface TestUser {
  id: string;
  username: string;
}

interface CountRow extends RowDataPacket {
  count: number;
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
    if (typeof current !== "object" || current === null || !(part in current)) {
      throw new Error(`响应中缺少 ${path.join(".")}`);
    }
    current = current[part as keyof typeof current];
  }
  if (typeof current !== "string") {
    throw new Error(`响应字段 ${path.join(".")} 不是字符串`);
  }
  return current;
}

function readData(body: unknown): unknown {
  if (typeof body === "object" && body !== null && "data" in body) {
    return body.data;
  }
  throw new Error("响应中缺少 data");
}

async function createUser(username: string, roles: readonly ("ADMIN" | "OWNER")[] = []): Promise<TestUser> {
  const user = await authRepository.createMember({
    username,
    passwordHash: await hashPassword(password),
    displayName: username,
    phone: `139${String(Math.floor(Math.random() * 10_000_000)).padStart(8, "0")}`
  });
  for (const role of roles) {
    await pool.execute(
      "INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?",
      [user.id, role]
    );
  }
  return { id: user.id, username };
}

async function createOwner(username: string, shopName: string): Promise<TestUser> {
  const owner = await createUser(username, ["OWNER"]);
  await pool.execute(
    "INSERT INTO shops (owner_user_id, name, description) VALUES (?, ?, ?)",
    [owner.id, shopName, `${shopName} 的测试店铺简介`]
  );
  return owner;
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

async function createCategory(agent: TestAgent, csrfToken: string, name = "新鲜水果"): Promise<string> {
  const response = await agent
    .post("/api/v1/admin/categories")
    .set("X-CSRF-Token", csrfToken)
    .send({ name, description: `${name} 分类描述` })
    .expect(200);
  return readStringPath(response.body, ["data", "id"]);
}

async function createDraftProduct(
  agent: TestAgent,
  csrfToken: string,
  categoryId: string,
  name = "高山苹果"
): Promise<string> {
  const response = await agent
    .post("/api/v1/owner/products")
    .set("X-CSRF-Token", csrfToken)
    .send({
      categoryId,
      name,
      description: `${name} 现摘现发，适合家庭分享`,
      price: "19.90",
      stock: 20,
      mainImagePath: "/uploads/products/2026/06/test.png"
    })
    .expect(200);
  return readStringPath(response.body, ["data", "id"]);
}

describe("商品目录 API", () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM payments");
    await pool.query("DELETE FROM order_items");
    await pool.query("DELETE FROM shop_orders");
    await pool.query("DELETE FROM master_orders");
    await pool.query("DELETE FROM cart_items");
    await pool.query("DELETE FROM addresses");
    await pool.query("DELETE FROM product_price_history");
    await pool.query("DELETE FROM products");
    await pool.query("DELETE FROM categories");
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

  it("管理员可创建、分页查询、停用和启用分类，并拒绝重复分类名", async () => {
    const admin = await createUser("catalog_admin", ["ADMIN"]);
    const { agent, csrfToken } = await loginAgent(admin.username);
    const categoryId = await createCategory(agent, csrfToken, "新鲜水果");

    await agent.get("/api/v1/admin/categories").expect(200).expect((response) => {
      expect(response.body).toMatchObject({
        success: true,
        data: [{ id: categoryId, name: "新鲜水果", status: "ACTIVE" }],
        meta: { page: 1, pageSize: 20, total: 1 }
      });
    });
    await agent
      .post("/api/v1/admin/categories")
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "新鲜水果", description: "重复分类描述" })
      .expect(409)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("CATEGORY_NAME_TAKEN");
      });
    await agent.post(`/api/v1/admin/categories/${categoryId}/disable`).set("X-CSRF-Token", csrfToken).send({}).expect(200);
    await agent.get("/api/v1/categories").expect(200).expect((response) => {
      expect(readData(response.body)).toEqual([]);
    });
    await agent.post(`/api/v1/admin/categories/${categoryId}/enable`).set("X-CSRF-Token", csrfToken).send({}).expect(200);
  });

  it("店主可维护本店商品，价格变化写入历史和审计", async () => {
    const admin = await createUser("catalog_admin_products", ["ADMIN"]);
    const owner = await createOwner("catalog_owner_products", "果园小铺");
    const adminSession = await loginAgent(admin.username);
    const ownerSession = await loginAgent(owner.username);
    const categoryId = await createCategory(adminSession.agent, adminSession.csrfToken);
    const productId = await createDraftProduct(ownerSession.agent, ownerSession.csrfToken, categoryId);

    await ownerSession.agent
      .patch(`/api/v1/owner/products/${productId}`)
      .set("X-CSRF-Token", ownerSession.csrfToken)
      .set("X-Request-Id", "22222222-2222-4222-8222-222222222222")
      .send({
        categoryId,
        name: "高山苹果礼盒",
        description: "高山苹果礼盒现摘现发，适合家庭分享",
        price: "21.90",
        stock: 18,
        mainImagePath: "/uploads/products/2026/06/test.png"
      })
      .expect(200)
      .expect((response) => {
        expect(readData(response.body)).toMatchObject({ id: productId, price: "21.90", version: 2 });
      });
    await ownerSession.agent.get(`/api/v1/owner/products/${productId}/price-history`).expect(200).expect((response) => {
      expect(readData(response.body)).toMatchObject([{ productId, oldPrice: "19.90", newPrice: "21.90" }]);
    });
    await ownerSession.agent.post(`/api/v1/owner/products/${productId}/publish`).set("X-CSRF-Token", ownerSession.csrfToken).send({}).expect(200);
    await ownerSession.agent.post(`/api/v1/owner/products/${productId}/unpublish`).set("X-CSRF-Token", ownerSession.csrfToken).send({}).expect(200);
    await ownerSession.agent.post(`/api/v1/owner/products/${productId}/archive`).set("X-CSRF-Token", ownerSession.csrfToken).send({}).expect(200);

    const [auditRows] = await pool.query<CountRow[]>(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE table_name = 'products' AND record_id = ?",
      [productId]
    );
    expect(auditRows[0]?.count).toBeGreaterThan(0);
  });

  it("店主共享全部商品，同时拒绝非法状态迁移和过期库存版本", async () => {
    const admin = await createUser("catalog_admin_owner_guard", ["ADMIN"]);
    const owner = await createOwner("catalog_owner_guard", "苹果店");
    const otherOwner = await createOwner("catalog_other_owner_guard", "梨子店");
    const adminSession = await loginAgent(admin.username);
    const ownerSession = await loginAgent(owner.username);
    const otherOwnerSession = await loginAgent(otherOwner.username);
    const categoryId = await createCategory(adminSession.agent, adminSession.csrfToken);
    const productId = await createDraftProduct(ownerSession.agent, ownerSession.csrfToken, categoryId);

    await otherOwnerSession.agent.get(`/api/v1/owner/products/${productId}`).expect(200).expect((response) => {
      expect(readData(response.body)).toEqual(expect.objectContaining({ id: productId }));
    });
    await ownerSession.agent
      .post(`/api/v1/owner/products/${productId}/unpublish`)
      .set("X-CSRF-Token", ownerSession.csrfToken)
      .send({})
      .expect(409)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("PRODUCT_STATE_CONFLICT");
      });
    await ownerSession.agent
      .patch(`/api/v1/owner/products/${productId}/stock`)
      .set("X-CSRF-Token", ownerSession.csrfToken)
      .send({ stock: 30, version: 99 })
      .expect(409)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("PRODUCT_VERSION_CONFLICT");
      });
  });

  it("公开列表只返回可售商品，并支持中文关键词搜索", async () => {
    const admin = await createUser("catalog_admin_public", ["ADMIN"]);
    const owner = await createOwner("catalog_owner_public", "水果公开店");
    const adminSession = await loginAgent(admin.username);
    const ownerSession = await loginAgent(owner.username);
    const categoryId = await createCategory(adminSession.agent, adminSession.csrfToken);
    const productId = await createDraftProduct(ownerSession.agent, ownerSession.csrfToken, categoryId, "高山苹果");

    await ownerSession.agent.post(`/api/v1/owner/products/${productId}/publish`).set("X-CSRF-Token", ownerSession.csrfToken).send({}).expect(200);
    await ownerSession.agent.get("/api/v1/products?keyword=苹果&sort=relevance").expect(200).expect((response) => {
      expect(response.body).toMatchObject({
        success: true,
        data: [{ id: productId, name: "高山苹果", category: { id: categoryId }, shop: { name: "水果公开店" } }]
      });
    });
    await ownerSession.agent.get(`/api/v1/products/${productId}`).expect(200).expect((response) => {
      expect(readData(response.body)).toMatchObject({ id: productId, name: "高山苹果", price: "19.90" });
    });
    await adminSession.agent.post(`/api/v1/admin/categories/${categoryId}/disable`).set("X-CSRF-Token", adminSession.csrfToken).send({}).expect(200);
    await ownerSession.agent.get("/api/v1/products?keyword=苹果&sort=relevance").expect(200).expect((response) => {
      expect(readData(response.body)).toEqual([]);
    });
  });

  it("上传商品图片时拒绝非图片和超限文件", async () => {
    const owner = await createOwner("catalog_owner_upload", "上传小铺");
    const { agent, csrfToken } = await loginAgent(owner.username);

    await agent
      .post("/api/v1/uploads/products")
      .set("X-CSRF-Token", csrfToken)
      .attach("image", productPng, { filename: "product.png", contentType: "image/png" })
      .expect(200)
      .expect((response) => {
        expect(readStringPath(response.body, ["data", "path"])).toMatch(/^\/uploads\/products\/\d{4}\/\d{2}\/.+\.png$/);
      });
    await agent
      .post("/api/v1/uploads/products")
      .set("X-CSRF-Token", csrfToken)
      .attach("image", tinyPng, { filename: "tiny.png", contentType: "image/png" })
      .expect(400)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("IMAGE_TOO_SMALL");
      });
    await agent
      .post("/api/v1/uploads/products")
      .set("X-CSRF-Token", csrfToken)
      .attach("image", Buffer.from("not image"), { filename: "note.txt", contentType: "text/plain" })
      .expect(400)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("INVALID_IMAGE_FILE");
      });
    await agent
      .post("/api/v1/uploads/products")
      .set("X-CSRF-Token", csrfToken)
      .attach("image", Buffer.alloc(2 * 1024 * 1024 + 1), { filename: "big.png", contentType: "image/png" })
      .expect(400)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("IMAGE_TOO_LARGE");
      });
  });
});
