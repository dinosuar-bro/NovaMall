import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

const execFileAsync = promisify(execFile);
const demoPassword = "StrongPass123!";

test.beforeAll(async () => {
  await execFileAsync("docker", ["compose", "run", "--rm", "seed-demo"], {
    timeout: 120_000
  });
});

test("新会员可注册进入 MEMBER 壳，并被后端拒绝访问 OWNER", async ({ page }) => {
  const suffix = Date.now().toString();
  await page.goto("/register");

  await page.getByLabel("用户名").fill(`e2e_member_${suffix}`);
  await page.getByLabel("手机号").fill(`139${suffix.slice(-8).padStart(8, "0")}`);
  await page.getByLabel("密码", { exact: true }).fill(demoPassword);
  await page.getByLabel("确认密码").fill(demoPassword);
  await page.getByRole("button", { name: "注册并进入会员首页" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "商品目录" })).toBeVisible();
  await expectProtectedRequest(page, "/api/v1/owner/overview", 403);
});

test("演示店主登录后进入 OWNER 壳，并被后端拒绝访问 ADMIN", async ({ page }) => {
  await login(page, "demo_owner");

  await expect(page.getByRole("heading", { level: 2, name: "商品管理" })).toBeVisible();
  await expectProtectedRequest(page, "/api/v1/admin/overview", 403);
});

test("演示管理员登录后进入 ADMIN 壳", async ({ page }) => {
  await login(page, "demo_admin");

  await expect(page.getByRole("heading", { level: 2, name: "分类管理" })).toBeVisible();
});

test("会员提交开店申请后，管理员批准并进入店主后台", async ({ page }) => {
  const suffix = Date.now().toString();
  const username = `e2e_merchant_${suffix}`;
  const shopName = `星选测试铺${suffix.slice(-5)}`;

  await page.goto("/register");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("手机号").fill(`138${suffix.slice(-8).padStart(8, "0")}`);
  await page.getByLabel("密码", { exact: true }).fill(demoPassword);
  await page.getByLabel("确认密码").fill(demoPassword);
  await page.getByRole("button", { name: "注册并进入会员首页" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "商品目录" })).toBeVisible();
  await page.getByRole("button", { name: /新会员/ }).click();
  await page.getByRole("menuitem", { name: "申请开店" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "开店申请" })).toBeVisible();
  await page.getByLabel("店铺名称").fill(shopName);
  await page.getByLabel("店铺简介").fill("主营社区精选商品和测试礼盒");
  await page.getByRole("button", { name: "提交开店申请" }).click();
  await expect(page.locator(".status-badge").filter({ hasText: "等待管理员审核" })).toBeVisible();

  await page.context().clearCookies();
  await login(page, "demo_admin");
  await page.getByRole("link", { name: "开店审核" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "开店审核" })).toBeVisible();
  const applicationRow = page.locator(".application-row").filter({ hasText: shopName });
  await expect(applicationRow).toBeVisible();
  await applicationRow.getByRole("button", { name: "批准" }).click();
  await expect(applicationRow.getByText("等待管理员审核")).toHaveCount(0);

  await page.context().clearCookies();
  await login(page, username);
  await expect(page.getByRole("heading", { level: 2, name: "商品管理" })).toBeVisible();
  await expect(page.getByRole("link", { name: "店铺资料" })).toHaveCount(0);
});

test("管理员创建分类，店主发布带图商品，会员可搜索查看", async ({ page }) => {
  const suffix = Date.now().toString();
  const categoryName = `新鲜水果${suffix.slice(-5)}`;
  const productName = `高山苹果${suffix.slice(-5)}`;

  await login(page, "demo_admin");
  await expect(page.getByRole("heading", { level: 2, name: "分类管理" })).toBeVisible();
  await page.getByLabel("分类名称").fill(categoryName);
  await page.getByLabel("分类简介").fill("当季水果与社区精选");
  await expect(page.getByRole("button", { name: "创建分类" })).toBeEnabled();
  const categoryResponsePromise = page.waitForResponse((response) => (
    response.url().includes("/api/v1/admin/categories") && response.request().method() === "POST"
  ));
  await page.getByRole("button", { name: "创建分类" }).click();
  const categoryResponse = await categoryResponsePromise;
  expect(categoryResponse.status()).toBe(200);
  await expect(page.locator(".compact-row").filter({ hasText: categoryName })).toBeVisible();

  await page.context().clearCookies();
  await login(page, "demo_owner");
  await expect(page.getByRole("heading", { level: 2, name: "商品管理" })).toBeVisible();
  await page.getByLabel("商品分类").selectOption({ label: categoryName });
  await page.getByLabel("商品名称").fill(productName);
  await page.getByLabel("商品简介").fill("现摘现发，适合家庭分享");
  await page.getByLabel("商品价格").fill("19.90");
  await page.getByLabel("商品库存").fill("20");
  await expect(page.getByLabel("商品价格")).toHaveValue("19.90");
  await expect(page.getByLabel("商品库存")).toHaveValue("20");
  await page.getByLabel("商品图片").setInputFiles("apps/web/public/product-placeholder.png");
  await expect(page.getByRole("button", { name: "创建草稿商品" })).toBeEnabled();
  const uploadResponsePromise = page.waitForResponse((response) => (
    response.url().includes("/api/v1/uploads/products") && response.request().method() === "POST"
  ));
  const productResponsePromise = page.waitForResponse((response) => (
    response.url().includes("/api/v1/owner/products") && response.request().method() === "POST"
  ));
  await page.getByRole("button", { name: "创建草稿商品" }).click();
  expect((await uploadResponsePromise).status()).toBe(200);
  expect((await productResponsePromise).status()).toBe(200);
  const productRow = page.locator(".compact-row").filter({ hasText: productName });
  await expect(productRow).toBeVisible();
  await productRow.getByRole("button", { name: "上架" }).click();
  await expect(productRow.getByText("已上架")).toBeVisible();

  await page.context().clearCookies();
  const username = `e2e_catalog_${suffix}`;
  await page.goto("/register");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("手机号").fill(`137${suffix.slice(-8).padStart(8, "0")}`);
  await page.getByLabel("密码", { exact: true }).fill(demoPassword);
  await page.getByLabel("确认密码").fill(demoPassword);
  await page.getByRole("button", { name: "注册并进入会员首页" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "商品目录" })).toBeVisible();
  await page.getByLabel("商品关键词").fill(productName);
  await page.getByRole("button", { name: "搜索商品" }).click();
  const publicProductCard = page.locator(".product-card").filter({ hasText: productName });
  await expect(publicProductCard).toBeVisible();
  await expect(publicProductCard.getByText("¥19.90")).toBeVisible();

  await publicProductCard.getByRole("button", { name: `加入购物车：${productName}` }).click();
  await expect(page.locator(".status-message").filter({ hasText: "已加入购物车" })).toBeVisible();
  await page.getByRole("link", { name: "购物车" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "购物车" })).toBeVisible();
  await page.getByLabel("收货人").fill("张三");
  await page.getByLabel("收货手机号").fill("13900000000");
  await page.getByLabel("省份").selectOption("广东省");
  await page.getByLabel("城市").selectOption("深圳市");
  await page.getByLabel("区县").selectOption("南山区");
  await page.getByLabel("详细地址").fill("科技园 1 号");
  await page.getByRole("button", { name: "保存地址" }).click();
  await expect(page.locator(".status-message").filter({ hasText: "地址已保存" })).toBeVisible();
  await page.getByRole("button", { name: "提交结算" }).click();
  await expect(page.getByRole("dialog", { name: "确认结算明细" })).toBeVisible();
  await page.getByRole("button", { name: "确认结算" }).click();
  await expect(page.locator(".status-message").filter({ hasText: "结算成功" })).toBeVisible();
  await page.getByRole("link", { name: "订单列表" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "订单列表" })).toBeVisible();
  await page.getByRole("button", { name: "去支付" }).click();
  await expect(page.locator(".status-message").filter({ hasText: "模拟支付成功" })).toBeVisible();

  await page.context().clearCookies();
  await login(page, "demo_owner");
  await page.getByRole("link", { name: "订单履约" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "订单履约" })).toBeVisible();
  await page.getByRole("button", { name: "标记发货" }).first().click();
  await expect(page.locator(".status-message").filter({ hasText: "子订单已发货" })).toBeVisible();

  await page.context().clearCookies();
  await login(page, username);
  await page.getByRole("link", { name: "订单列表" }).click();
  await expect(page.getByRole("button", { name: "确认收货" })).toBeVisible();
  await page.getByRole("button", { name: "确认收货" }).first().click();
  await expect(page.locator(".status-message").filter({ hasText: "已确认收货" })).toBeVisible();

  await page.context().clearCookies();
  await login(page, "demo_admin");
  await page.getByRole("link", { name: "数据库证据" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "审计日志" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "有效销量 Top 10" })).toBeVisible();
  await expect(page.getByText("shop_orders").first()).toBeVisible();
});

async function login(page: Page, username: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "登录" }).click();
}

async function expectProtectedRequest(page: Page, path: string, expectedStatus: number): Promise<void> {
  const status = await page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, { credentials: "include" });
    return response.status;
  }, path);
  expect(status).toBe(expectedStatus);
}
