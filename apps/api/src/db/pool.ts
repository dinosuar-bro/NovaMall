import mysql from "mysql2";
import type { Pool } from "mysql2/promise";

interface PoolEnv {
  DATABASE_URL: string;
}

export function createPoolFromEnv(env: PoolEnv): Pool {
  const rawPool = mysql.createPool(env.DATABASE_URL);

  rawPool.on("connection", (connection) => {
    connection.query(
      "SET SESSION block_encryption_mode = 'aes-256-cbc'",
      (error) => {
        if (error !== null) {
          connection.destroy();
        }
      }
    );
  });

  return rawPool.promise();
}
