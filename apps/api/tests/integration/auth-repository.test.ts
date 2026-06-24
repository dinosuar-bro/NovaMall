import type { RowDataPacket } from "mysql2/promise";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { AppError } from "../../src/errors/app-error.js";
import { createPoolFromEnv } from "../../src/db/pool.js";
import { AuthRepository } from "../../src/modules/auth/auth.repository.js";

const pool = createPoolFromEnv({
  DATABASE_URL: process.env.TEST_DATABASE_URL
    ?? "mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test"
});

const phoneAesKey = "phone-key-with-at-least-32-characters";

interface StoredUserRow extends RowDataPacket {
  id: number;
  phone_cipher: Buffer;
  phone_iv: Buffer;
}

interface RoleCountRow extends RowDataPacket {
  count: number;
}

describe("AuthRepository", () => {
  const repository = new AuthRepository(pool, phoneAesKey);

  beforeEach(async () => {
    await pool.query("DELETE FROM audit_logs");
    await pool.query("DELETE FROM shops");
    await pool.query("DELETE FROM merchant_applications");
    await pool.query("DELETE FROM user_roles");
    await pool.query("DELETE FROM users");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("注册会员时加密手机号并在同一事务授予 MEMBER 角色", async () => {
    const created = await repository.createMember({
      username: "repo_user",
      passwordHash: "hashed-password",
      displayName: "仓储用户",
      phone: "13800138000"
    });

    expect(created).toMatchObject({
      username: "repo_user",
      displayName: "仓储用户",
      roles: ["MEMBER"]
    });
    expect(created.id).toEqual(expect.any(String));

    const [storedUsers] = await pool.query<StoredUserRow[]>(
      "SELECT id, phone_cipher, phone_iv FROM users WHERE username = ?",
      ["repo_user"]
    );
    const storedUser = storedUsers[0];
    expect(storedUser).toBeDefined();
    if (storedUser === undefined) {
      throw new Error("测试用户未写入");
    }
    expect(storedUser.phone_cipher.toString("utf8")).not.toContain("13800138000");
    expect(storedUser.phone_iv.byteLength).toBe(16);

    const [roleCounts] = await pool.query<RoleCountRow[]>(
      `SELECT COUNT(*) AS count
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ? AND r.code = 'MEMBER'`,
      [storedUser.id]
    );
    expect(roleCounts[0]?.count).toBe(1);

    const profile = await repository.findPrivateProfileById(created.id);
    expect(profile?.phone).toBe("13800138000");
  });

  it("相同手机号每次注册产生不同密文", async () => {
    await repository.createMember({
      username: "repo_user_a",
      passwordHash: "hashed-password",
      displayName: "用户 A",
      phone: "13800138000"
    });
    await repository.createMember({
      username: "repo_user_b",
      passwordHash: "hashed-password",
      displayName: "用户 B",
      phone: "13800138000"
    });

    const [rows] = await pool.query<StoredUserRow[]>(
      "SELECT phone_cipher, phone_iv FROM users ORDER BY username"
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.phone_cipher.equals(rows[1]?.phone_cipher ?? Buffer.alloc(0))).toBe(false);
    expect(rows[0]?.phone_iv.equals(rows[1]?.phone_iv ?? Buffer.alloc(0))).toBe(false);
  });

  it("重复用户名映射为稳定业务错误", async () => {
    const input = {
      username: "repo_duplicate",
      passwordHash: "hashed-password",
      displayName: "重复用户",
      phone: "13800138000"
    };

    await repository.createMember(input);
    await expect(repository.createMember(input)).rejects.toMatchObject({
      code: "USERNAME_TAKEN",
      status: 409
    } satisfies Partial<AppError>);
  });
});
