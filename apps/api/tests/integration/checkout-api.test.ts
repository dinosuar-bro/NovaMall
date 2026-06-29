import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { errorResponseSchema } from "@novamall/shared";

import { createApp } from "../../src/app.js";
import { createPoolFromEnv } from "../../src/db/pool.js";
import { MysqlSessionStore } from "../../src/db/session-store.js";
import { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { hashPassword } from "../../src/modules/auth/password.js";
import { CatalogRepository } from "../../src/modules/catalog/catalog.repository.js";
import { CheckoutRepository } from "../../src/modules/checkout/checkout.repository.js";
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
  catalogRepository: new CatalogRepository(pool, "uploads"),
  checkoutRepository: new CheckoutRepository(pool, phoneAesKey),
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

interface ProductStockRow extends RowDataPacket {
  stock: number;
}

interface OrderStatusRow extends RowDataPacket {
  status: string;
}

interface ShopOrderNoRow extends RowDataPacket {
  shop_order_no: string;
}

interface CipherRow extends RowDataPacket {
  receiver_phone_cipher: Buffer;
  receiver_phone_iv: Buffer;
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

async function createOwner(username: string, shopName: string): Promise<TestUser & { shopId: string }> {
  const owner = await createUser(username, ["OWNER"]);
  const [shopResult] = await pool.execute<ResultSetHeader>(
    "INSERT INTO shops (owner_user_id, name, description) VALUES (?, ?, ?)",
    [owner.id, shopName, `${shopName} 的测试店铺简介`]
  );
  return { ...owner, shopId: String(shopResult.insertId) };
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

async function createCategory(name: string): Promise<string> {
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO categories (name, description) VALUES (?, ?)",
    [name, `${name} 分类描述`]
  );
  return String(result.insertId);
}

async function createPublishedProduct(input: {
  shopId: string;
  categoryId: string;
  name: string;
  price: string;
  stock: number;
}): Promise<string> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO products (shop_id, category_id, name, description, price, stock, main_image_path, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PUBLISHED')`,
    [
      input.shopId,
      input.categoryId,
      input.name,
      `${input.name} 现摘现发，适合家庭分享`,
      input.price,
      input.stock,
      "/uploads/products/2026/06/test.png"
    ]
  );
  return String(result.insertId);
}

async function createAddress(agent: TestAgent, csrfToken: string): Promise<string> {
  const response = await agent
    .post("/api/v1/member/addresses")
    .set("X-CSRF-Token", csrfToken)
    .send({
      receiverName: "张三",
      receiverPhone: "13900000000",
      province: "广东省",
      city: "深圳市",
      district: "南山区",
      detail: "科技园 1 号",
      isDefault: true
    })
    .expect(200);
  return readStringPath(response.body, ["data", "id"]);
}

async function addCartItem(agent: TestAgent, csrfToken: string, productId: string, quantity: number): Promise<void> {
  await agent
    .post("/api/v1/member/cart/items")
    .set("X-CSRF-Token", csrfToken)
    .send({ productId, quantity })
    .expect(200);
}

describe("结算与数据库核心 API", () => {
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

  it("跨店结算创建总订单和两个子订单，并支持 checkoutToken 幂等", async () => {
    const member = await createUser("checkout_member");
    const ownerA = await createOwner("checkout_owner_a", "苹果店");
    const ownerB = await createOwner("checkout_owner_b", "梨子店");
    const categoryId = await createCategory("新鲜水果");
    const productA = await createPublishedProduct({ shopId: ownerA.shopId, categoryId, name: "高山苹果", price: "19.90", stock: 10 });
    const productB = await createPublishedProduct({ shopId: ownerB.shopId, categoryId, name: "雪梨礼盒", price: "29.90", stock: 8 });
    const { agent, csrfToken } = await loginAgent(member.username);
    const addressId = await createAddress(agent, csrfToken);
    await addCartItem(agent, csrfToken, productA, 2);
    await addCartItem(agent, csrfToken, productB, 1);

    const checkoutToken = "11111111-1111-4111-8111-111111111111";
    const firstCheckout = await agent
      .post("/api/v1/member/checkout")
      .set("X-CSRF-Token", csrfToken)
      .send({ addressId, checkoutToken })
      .expect(200);
    const orderNo = readStringPath(firstCheckout.body, ["data", "orderNo"]);
    const secondCheckout = await agent
      .post("/api/v1/member/checkout")
      .set("X-CSRF-Token", csrfToken)
      .send({ addressId, checkoutToken })
      .expect(200);

    expect(readStringPath(secondCheckout.body, ["data", "orderNo"])).toBe(orderNo);
    const [shopOrderRows] = await pool.query<CountRow[]>("SELECT COUNT(*) AS count FROM shop_orders");
    const [orderItemRows] = await pool.query<CountRow[]>("SELECT COUNT(*) AS count FROM order_items");
    const [cartRows] = await pool.query<CountRow[]>("SELECT COUNT(*) AS count FROM cart_items");
    const [addressCipherRows] = await pool.query<CipherRow[]>(
      "SELECT receiver_phone_cipher, receiver_phone_iv FROM addresses WHERE id = ?",
      [addressId]
    );
    const [orderCipherRows] = await pool.query<CipherRow[]>(
      "SELECT receiver_phone_cipher, receiver_phone_iv FROM master_orders WHERE order_no = ?",
      [orderNo]
    );
    expect(shopOrderRows[0]?.count).toBe(2);
    expect(orderItemRows[0]?.count).toBe(2);
    expect(cartRows[0]?.count).toBe(0);
    expect(addressCipherRows[0]?.receiver_phone_cipher.toString("utf8")).not.toContain("13900000000");
    expect(addressCipherRows[0]?.receiver_phone_iv.byteLength).toBe(16);
    expect(orderCipherRows[0]?.receiver_phone_cipher.toString("utf8")).not.toContain("13900000000");
    expect(orderCipherRows[0]?.receiver_phone_iv.byteLength).toBe(16);
  });

  it("库存不足时结算回滚并保留购物车", async () => {
    const member = await createUser("checkout_stock_member");
    const owner = await createOwner("checkout_stock_owner", "库存店");
    const categoryId = await createCategory("库存分类");
    const productId = await createPublishedProduct({ shopId: owner.shopId, categoryId, name: "限量桃子", price: "9.90", stock: 1 });
    const { agent, csrfToken } = await loginAgent(member.username);
    const addressId = await createAddress(agent, csrfToken);
    await addCartItem(agent, csrfToken, productId, 2);

    await agent
      .post("/api/v1/member/checkout")
      .set("X-CSRF-Token", csrfToken)
      .send({ addressId, checkoutToken: "22222222-2222-4222-8222-222222222222" })
      .expect(409)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("OUT_OF_STOCK");
      });

    const [masterRows] = await pool.query<CountRow[]>("SELECT COUNT(*) AS count FROM master_orders");
    const [cartRows] = await pool.query<CountRow[]>("SELECT COUNT(*) AS count FROM cart_items");
    const [stockRows] = await pool.query<ProductStockRow[]>("SELECT stock FROM products WHERE id = ?", [productId]);
    expect(masterRows[0]?.count).toBe(0);
    expect(cartRows[0]?.count).toBe(1);
    expect(stockRows[0]?.stock).toBe(1);
  });

  it("支持模拟支付、取消、店主子订单、审计日志和 Top 10 查询", async () => {
    const admin = await createUser("checkout_admin", ["ADMIN"]);
    const member = await createUser("checkout_ops_member");
    const owner = await createOwner("checkout_ops_owner", "运营店");
    const categoryId = await createCategory("运营分类");
    const paidProductId = await createPublishedProduct({ shopId: owner.shopId, categoryId, name: "热销苹果", price: "10.00", stock: 10 });
    const cancelProductId = await createPublishedProduct({ shopId: owner.shopId, categoryId, name: "可取消梨", price: "8.00", stock: 5 });
    const memberSession = await loginAgent(member.username);
    const ownerSession = await loginAgent(owner.username);
    const adminSession = await loginAgent(admin.username);
    const addressId = await createAddress(memberSession.agent, memberSession.csrfToken);

    await addCartItem(memberSession.agent, memberSession.csrfToken, paidProductId, 3);
    const paidOrderNo = readStringPath((await memberSession.agent
      .post("/api/v1/member/checkout")
      .set("X-CSRF-Token", memberSession.csrfToken)
      .send({ addressId, checkoutToken: "33333333-3333-4333-8333-333333333333" })
      .expect(200)).body, ["data", "orderNo"]);
    await memberSession.agent
      .post(`/api/v1/member/orders/${paidOrderNo}/pay`)
      .set("X-CSRF-Token", memberSession.csrfToken)
      .send({})
      .expect(200);
    await memberSession.agent
      .post(`/api/v1/member/orders/${paidOrderNo}/pay`)
      .set("X-CSRF-Token", memberSession.csrfToken)
      .send({})
      .expect(200);

    await ownerSession.agent.get("/api/v1/owner/shop-orders").expect(200).expect((response) => {
      expect(readData(response.body)).toEqual(expect.arrayContaining([
        expect.objectContaining({ masterOrderNo: paidOrderNo, status: "PENDING_SHIPMENT" })
      ]));
    });
    await adminSession.agent.get("/api/v1/admin/database/top-products").expect(200).expect((response) => {
      expect(readData(response.body)).toEqual([
        expect.objectContaining({ productId: paidProductId, productName: "热销苹果", soldQuantity: 3, salesRank: 1 })
      ]);
    });

    await addCartItem(memberSession.agent, memberSession.csrfToken, cancelProductId, 2);
    const cancelOrderNo = readStringPath((await memberSession.agent
      .post("/api/v1/member/checkout")
      .set("X-CSRF-Token", memberSession.csrfToken)
      .send({ addressId, checkoutToken: "44444444-4444-4444-8444-444444444444" })
      .expect(200)).body, ["data", "orderNo"]);
    await memberSession.agent
      .post(`/api/v1/member/orders/${cancelOrderNo}/cancel`)
      .set("X-CSRF-Token", memberSession.csrfToken)
      .send({})
      .expect(200);

    const [stockRows] = await pool.query<ProductStockRow[]>("SELECT stock FROM products WHERE id = ?", [cancelProductId]);
    expect(stockRows[0]?.stock).toBe(5);
    await adminSession.agent.get("/api/v1/admin/audit-logs").expect(200).expect((response) => {
      expect(readData(response.body)).toEqual(expect.arrayContaining([
        expect.objectContaining({ tableName: "master_orders", action: "STATUS_CHANGE" })
      ]));
    });
  });

  it("Top 10 在销量并列时按销售额降序排序", async () => {
    const admin = await createUser("top_sort_admin", ["ADMIN"]);
    const member = await createUser("top_sort_member");
    const owner = await createOwner("top_sort_owner", "排序店");
    const categoryId = await createCategory("排序分类");
    const { agent: adminAgent } = await loginAgent(admin.username);
    const { agent: memberAgent, csrfToken } = await loginAgent(member.username);
    const addressId = await createAddress(memberAgent, csrfToken);

    await pool.execute(
      `INSERT INTO products (id, shop_id, category_id, name, description, price, stock, main_image_path, status)
       VALUES
         (99, ?, ?, '并列商品 99', '销量并列排序测试', '10.00', 10, '/uploads/products/2026/06/test.png', 'PUBLISHED'),
         (100, ?, ?, '并列商品 100', '销量并列排序测试', '10.00', 10, '/uploads/products/2026/06/test.png', 'PUBLISHED'),
         (1000, ?, ?, '并列商品 1000', '销量并列排序测试', '10.00', 10, '/uploads/products/2026/06/test.png', 'PUBLISHED')`,
      [owner.shopId, categoryId, owner.shopId, categoryId, owner.shopId, categoryId]
    );
    await pool.execute(
      `INSERT INTO master_orders (
         order_no,
         buyer_user_id,
         address_id,
         checkout_token,
         total_amount,
         status,
         receiver_name,
         receiver_phone_cipher,
         receiver_phone_iv,
         address_snapshot,
         paid_at
       )
       SELECT
         'TOPSORT-MO-1',
         ?,
         a.id,
         '66666666-6666-4666-8666-666666666666',
         '150.00',
         'PAID',
         a.receiver_name,
         a.receiver_phone_cipher,
         a.receiver_phone_iv,
         JSON_OBJECT('province', a.province, 'city', a.city, 'district', a.district, 'detail', a.detail),
         NOW(3)
       FROM addresses a
       WHERE a.id = ?`,
      [member.id, addressId]
    );
    const [shopOrderResult] = await pool.execute<ResultSetHeader>(
      `INSERT INTO shop_orders (master_order_id, shop_id, shop_order_no, subtotal_amount, status, paid_at)
       SELECT id, ?, 'TOPSORT-SO-1', '150.00', 'PENDING_SHIPMENT', NOW(3)
       FROM master_orders
       WHERE order_no = 'TOPSORT-MO-1'`,
      [owner.shopId]
    );
    await pool.execute(
      `INSERT INTO order_items (
         shop_order_id,
         product_id,
         product_name,
         product_main_image_path,
         unit_price,
         quantity,
         line_amount
       )
       VALUES
         (?, 99, '并列商品 99', '/uploads/products/2026/06/test.png', '10.00', 5, '50.00'),
         (?, 100, '并列商品 100', '/uploads/products/2026/06/test.png', '14.00', 5, '70.00'),
         (?, 1000, '并列商品 1000', '/uploads/products/2026/06/test.png', '12.00', 5, '60.00')`,
      [shopOrderResult.insertId, shopOrderResult.insertId, shopOrderResult.insertId]
    );

    await adminAgent.get("/api/v1/admin/database/top-products").expect(200).expect((response) => {
      const data = readData(response.body);
      expect(data).toEqual([
        expect.objectContaining({ productId: "100", soldQuantity: 5, salesAmount: "70.00", salesRank: 1 }),
        expect.objectContaining({ productId: "1000", soldQuantity: 5, salesAmount: "60.00", salesRank: 2 }),
        expect.objectContaining({ productId: "99", soldQuantity: 5, salesAmount: "50.00", salesRank: 3 })
      ]);
    });
  });

  it("店主可发货本店子订单，会员可确认收货并完成总订单", async () => {
    const admin = await createUser("fulfillment_admin", ["ADMIN"]);
    const member = await createUser("fulfillment_member");
    const ownerA = await createOwner("fulfillment_owner_a", "履约苹果店");
    const ownerB = await createOwner("fulfillment_owner_b", "履约梨子店");
    const otherOwner = await createOwner("fulfillment_other_owner", "无关店铺");
    const categoryId = await createCategory("履约分类");
    const productA = await createPublishedProduct({ shopId: ownerA.shopId, categoryId, name: "履约苹果", price: "12.00", stock: 10 });
    const productB = await createPublishedProduct({ shopId: ownerB.shopId, categoryId, name: "履约雪梨", price: "15.00", stock: 10 });
    const memberSession = await loginAgent(member.username);
    const ownerASession = await loginAgent(ownerA.username);
    const ownerBSession = await loginAgent(ownerB.username);
    const otherOwnerSession = await loginAgent(otherOwner.username);
    const adminSession = await loginAgent(admin.username);
    const addressId = await createAddress(memberSession.agent, memberSession.csrfToken);

    await addCartItem(memberSession.agent, memberSession.csrfToken, productA, 1);
    await addCartItem(memberSession.agent, memberSession.csrfToken, productB, 1);
    const orderNo = readStringPath((await memberSession.agent
      .post("/api/v1/member/checkout")
      .set("X-CSRF-Token", memberSession.csrfToken)
      .send({ addressId, checkoutToken: "55555555-5555-4555-8555-555555555555" })
      .expect(200)).body, ["data", "orderNo"]);
    await memberSession.agent
      .post(`/api/v1/member/orders/${orderNo}/pay`)
      .set("X-CSRF-Token", memberSession.csrfToken)
      .send({})
      .expect(200);

    const [shopOrderRows] = await pool.query<ShopOrderNoRow[]>(
      `SELECT so.shop_order_no
         FROM shop_orders so
         JOIN master_orders mo ON mo.id = so.master_order_id
        WHERE mo.order_no = ?
        ORDER BY so.shop_id ASC`,
      [orderNo]
    );
    const firstShopOrderNo = shopOrderRows[0]?.shop_order_no;
    const secondShopOrderNo = shopOrderRows[1]?.shop_order_no;
    if (firstShopOrderNo === undefined || secondShopOrderNo === undefined) {
      throw new Error("测试订单缺少子订单");
    }

    await otherOwnerSession.agent
      .post(`/api/v1/owner/shop-orders/${firstShopOrderNo}/ship`)
      .set("X-CSRF-Token", otherOwnerSession.csrfToken)
      .send({})
      .expect(404);
    await ownerASession.agent
      .post(`/api/v1/owner/shop-orders/${firstShopOrderNo}/ship`)
      .set("X-CSRF-Token", ownerASession.csrfToken)
      .send({})
      .expect(200);
    await ownerASession.agent
      .post(`/api/v1/owner/shop-orders/${firstShopOrderNo}/ship`)
      .set("X-CSRF-Token", ownerASession.csrfToken)
      .send({})
      .expect(409)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("ORDER_STATE_CONFLICT");
      });
    await ownerBSession.agent
      .post(`/api/v1/owner/shop-orders/${secondShopOrderNo}/ship`)
      .set("X-CSRF-Token", ownerBSession.csrfToken)
      .send({})
      .expect(200);

    await memberSession.agent
      .post(`/api/v1/member/shop-orders/${firstShopOrderNo}/confirm`)
      .set("X-CSRF-Token", memberSession.csrfToken)
      .send({})
      .expect(200);
    const [statusBeforeRows] = await pool.query<OrderStatusRow[]>(
      "SELECT status FROM master_orders WHERE order_no = ?",
      [orderNo]
    );
    expect(statusBeforeRows[0]?.status).toBe("PAID");

    await memberSession.agent
      .post(`/api/v1/member/shop-orders/${secondShopOrderNo}/confirm`)
      .set("X-CSRF-Token", memberSession.csrfToken)
      .send({})
      .expect(200);
    await memberSession.agent
      .post(`/api/v1/member/shop-orders/${secondShopOrderNo}/confirm`)
      .set("X-CSRF-Token", memberSession.csrfToken)
      .send({})
      .expect(409)
      .expect((response) => {
        expect(errorResponseSchema.parse(response.body).error.code).toBe("ORDER_STATE_CONFLICT");
      });

    const [statusAfterRows] = await pool.query<OrderStatusRow[]>(
      "SELECT status FROM master_orders WHERE order_no = ?",
      [orderNo]
    );
    expect(statusAfterRows[0]?.status).toBe("COMPLETED");
    await adminSession.agent.get("/api/v1/admin/audit-logs").expect(200).expect((response) => {
      expect(readData(response.body)).toEqual(expect.arrayContaining([
        expect.objectContaining({ tableName: "shop_orders", action: "STATUS_CHANGE" }),
        expect.objectContaining({ tableName: "master_orders", action: "STATUS_CHANGE" })
      ]));
    });
  });
});
