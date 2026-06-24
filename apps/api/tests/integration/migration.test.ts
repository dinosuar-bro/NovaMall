import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL
  ?? "mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test";

interface TableRow extends RowDataPacket {
  TABLE_NAME: string;
}

interface RoleRow extends RowDataPacket {
  code: string;
}

interface TriggerRow extends RowDataPacket {
  TRIGGER_NAME: string;
}

interface ConstraintRow extends RowDataPacket {
  CONSTRAINT_NAME: string;
}

describe("阶段 1 数据库迁移", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = mysql.createPool(testDatabaseUrl);
  });

  beforeEach(async () => {
    const [tables] = await pool.query<TableRow[]>(
      `SELECT TABLE_NAME
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('users', 'user_roles', 'merchant_applications', 'shops', 'audit_logs')`
    );
    const tableNames = new Set(tables.map((row) => row.TABLE_NAME));
    if (tableNames.has("audit_logs")) {
      await pool.query("DELETE FROM audit_logs");
    }
    if (tableNames.has("shops")) {
      await pool.query("DELETE FROM shops");
    }
    if (tableNames.has("merchant_applications")) {
      await pool.query("DELETE FROM merchant_applications");
    }
    if (tableNames.has("user_roles")) {
      await pool.query("DELETE FROM user_roles");
    }
    if (tableNames.has("users")) {
      await pool.query("DELETE FROM users");
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("创建认证表和迁移记录表", async () => {
    const [rows] = await pool.query<TableRow[]>(
      `SELECT TABLE_NAME
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()`
    );
    const tableNames = rows.map((row) => row.TABLE_NAME);

    expect(tableNames).toEqual(expect.arrayContaining([
      "users",
      "roles",
      "user_roles",
      "sessions",
      "merchant_applications",
      "shops",
      "audit_logs",
      "schema_migrations"
    ]));
  });

  it("创建商户入驻审计触发器", async () => {
    const [rows] = await pool.query<TriggerRow[]>(
      `SELECT TRIGGER_NAME
         FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = DATABASE()
          AND TRIGGER_NAME = 'trg_merchant_applications_status_audit'`
    );

    expect(rows.map((row) => row.TRIGGER_NAME)).toEqual(["trg_merchant_applications_status_audit"]);
  });

  it("创建开店申请和店铺唯一约束", async () => {
    const [rows] = await pool.query<ConstraintRow[]>(
      `SELECT CONSTRAINT_NAME
         FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('merchant_applications', 'shops')
          AND CONSTRAINT_TYPE = 'UNIQUE'
        ORDER BY CONSTRAINT_NAME`
    );

    expect(rows.map((row) => row.CONSTRAINT_NAME)).toEqual(expect.arrayContaining([
      "uq_merchant_applications_user",
      "uq_shops_name",
      "uq_shops_owner_user"
    ]));
  });

  it("写入三种固定角色", async () => {
    const [rows] = await pool.query<RoleRow[]>("SELECT code FROM roles ORDER BY code");
    expect(rows.map((row) => row.code)).toEqual(["ADMIN", "MEMBER", "OWNER"]);
  });

  it("拒绝重复用户名和非法用户状态", async () => {
    const values = ["duplicate_user", "hash", "重复用户", Buffer.from("cipher"), Buffer.alloc(16), "ACTIVE"];
    await pool.execute(
      `INSERT INTO users (username, password_hash, display_name, phone_cipher, phone_iv, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      values
    );

    await expect(pool.execute(
      `INSERT INTO users (username, password_hash, display_name, phone_cipher, phone_iv, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      values
    )).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });

    await expect(pool.execute(
      `INSERT INTO users (username, password_hash, display_name, phone_cipher, phone_iv, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["invalid_status", "hash", "非法状态", Buffer.from("cipher"), Buffer.alloc(16), "UNKNOWN"]
    )).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
  });

  it("拒绝重复的用户角色关系", async () => {
    const [userResult] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO users (username, password_hash, display_name, phone_cipher, phone_iv)
       VALUES (?, ?, ?, ?, ?)`,
      ["role_user", "hash", "角色用户", Buffer.from("cipher"), Buffer.alloc(16)]
    );
    const [roleRows] = await pool.query<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM roles WHERE code = 'MEMBER'"
    );
    const roleId = roleRows[0]?.id;
    if (roleId === undefined) {
      throw new Error("MEMBER 角色不存在");
    }

    await pool.execute(
      "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
      [userResult.insertId, roleId]
    );
    await expect(pool.execute(
      "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
      [userResult.insertId, roleId]
    )).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
  });
});
