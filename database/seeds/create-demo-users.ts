import { createPoolFromEnv } from "../../apps/api/src/db/pool.js";
import { seedDemoUsers } from "../../apps/api/src/modules/auth/demo-seed.js";

const databaseUrl = readRequiredEnv("DATABASE_URL");
const phoneAesKey = readRequiredEnv("PHONE_AES_KEY");

async function main(): Promise<void> {
  const pool = createPoolFromEnv({ DATABASE_URL: databaseUrl });
  try {
    await seedDemoUsers(pool, phoneAesKey);
    console.log("演示账号已准备：demo_owner / demo_admin，密码均为 StrongPass123!");
  } finally {
    await pool.end();
  }
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`缺少环境变量：${name}`);
  }
  return value;
}

await main();
