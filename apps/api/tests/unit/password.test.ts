import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../../src/modules/auth/password.js";

describe("scrypt 密码哈希", () => {
  it("同一密码每次生成不同哈希，且可正确验证", async () => {
    const first = await hashPassword("StrongPass123!");
    const second = await hashPassword("StrongPass123!");

    expect(first).not.toBe(second);
    expect(await verifyPassword("StrongPass123!", first)).toBe(true);
    expect(await verifyPassword("wrong", first)).toBe(false);
  });

  it("拒绝格式错误或未知版本的编码串", async () => {
    await expect(verifyPassword("StrongPass123!", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPassword("StrongPass123!", "scrypt$v=999$N=16384$r=8$p=1$salt$hash")).resolves.toBe(false);
  });
});
