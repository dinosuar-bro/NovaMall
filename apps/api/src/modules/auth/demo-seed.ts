import { randomBytes } from "node:crypto";

import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { RoleCode } from "@novamall/shared";

import { hashPassword } from "./password.js";

interface DemoAccount {
  username: string;
  password: string;
  displayName: string;
  phone: string;
  roles: RoleCode[];
}

interface UserIdRow extends RowDataPacket {
  id: string;
}

const demoAccounts: DemoAccount[] = [
  {
    username: "demo_owner",
    password: "StrongPass123!",
    displayName: "演示店主",
    phone: "13700137000",
    roles: ["MEMBER", "OWNER"]
  },
  {
    username: "demo_admin",
    password: "StrongPass123!",
    displayName: "演示管理员",
    phone: "13600136000",
    roles: ["MEMBER", "ADMIN"]
  }
];

export async function seedDemoUsers(pool: Pool, phoneAesKey: string): Promise<void> {
  for (const account of demoAccounts) {
    await upsertDemoAccount(pool, phoneAesKey, account);
  }
}

async function upsertDemoAccount(pool: Pool, phoneAesKey: string, account: DemoAccount): Promise<void> {
  const phoneIv = randomBytes(16);
  const passwordHash = await hashPassword(account.password);
  await pool.execute<ResultSetHeader>(
    `INSERT INTO users (username, password_hash, display_name, phone_cipher, phone_iv, status)
     VALUES (?, ?, ?, AES_ENCRYPT(?, ?, ?), ?, 'ACTIVE')
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       display_name = VALUES(display_name),
       phone_cipher = VALUES(phone_cipher),
       phone_iv = VALUES(phone_iv),
       status = 'ACTIVE'`,
    [
      account.username,
      passwordHash,
      account.displayName,
      account.phone,
      phoneAesKey,
      phoneIv,
      phoneIv
    ]
  );

  const [rows] = await pool.query<UserIdRow[]>(
    "SELECT CAST(id AS CHAR) AS id FROM users WHERE username = ?",
    [account.username]
  );
  const userId = rows[0]?.id;
  if (userId === undefined) {
    throw new Error(`演示账号创建失败：${account.username}`);
  }

  const placeholders = account.roles.map(() => "?").join(", ");
  await pool.execute<ResultSetHeader>(
    `INSERT IGNORE INTO user_roles (user_id, role_id)
     SELECT ?, id FROM roles WHERE code IN (${placeholders})`,
    [userId, ...account.roles]
  );

  if (account.username === "demo_owner") {
    await pool.execute<ResultSetHeader>(
      `INSERT INTO shops (owner_user_id, name, description, status)
       VALUES (?, ?, ?, 'ACTIVE')
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         description = VALUES(description),
         status = 'ACTIVE'`,
      [userId, "演示店铺", "用于商品目录和订单流程演示的默认店铺"]
    );
  }
}
