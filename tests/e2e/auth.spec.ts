import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

const execFileAsync = promisify(execFile);
const demoPassword = "StrongPass123!";

test.beforeAll(async () => {
  await execFileAsync("docker", ["compose", "run", "--rm", "--build", "seed-demo"], {
    timeout: 120_000
  });
});

test("移动视口下新会员可注册进入 MEMBER 壳，并被后端拒绝访问 OWNER", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const suffix = Date.now().toString();
  await page.goto("/register");

  await page.getByLabel("用户名").fill(`e2e_member_${suffix}`);
  await page.getByLabel("展示名").fill("E2E 会员");
  await page.getByLabel("手机号").fill(`139${suffix.slice(-8).padStart(8, "0")}`);
  await page.getByLabel("密码").fill(demoPassword);
  await page.getByRole("button", { name: "注册并进入会员首页" }).click();

  await expect(page.getByRole("heading", { name: "会员首页壳已就绪" })).toBeVisible();
  await expectProtectedRequest(page, "/api/v1/owner/overview", 403);
});

test("演示店主登录后进入 OWNER 壳，并被后端拒绝访问 ADMIN", async ({ page }) => {
  await login(page, "demo_owner");

  await expect(page.getByRole("heading", { name: "店主后台壳已就绪" })).toBeVisible();
  await expectProtectedRequest(page, "/api/v1/admin/overview", 403);
});

test("演示管理员登录后进入 ADMIN 壳", async ({ page }) => {
  await login(page, "demo_admin");

  await expect(page.getByRole("heading", { name: "管理员后台壳已就绪" })).toBeVisible();
});

async function login(page: Page, username: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(demoPassword);
  await page.getByRole("button", { name: "登录" }).click();
}

async function expectProtectedRequest(page: Page, path: string, expectedStatus: number): Promise<void> {
  const status = await page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, { credentials: "include" });
    return response.status;
  }, path);
  expect(status).toBe(expectedStatus);
}
