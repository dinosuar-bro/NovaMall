import session, { type SessionData } from "express-session";
import type { RowDataPacket } from "mysql2/promise";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createPoolFromEnv } from "../../src/db/pool.js";
import { MysqlSessionStore } from "../../src/db/session-store.js";

const pool = createPoolFromEnv({
  DATABASE_URL: process.env.TEST_DATABASE_URL
    ?? "mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test"
});

function setSession(store: MysqlSessionStore, sid: string, data: SessionData): Promise<void> {
  return new Promise((resolve, reject) => {
    store.set(sid, data, (error) => error == null ? resolve() : reject(toError(error)));
  });
}

function getSession(store: MysqlSessionStore, sid: string): Promise<SessionData | null> {
  return new Promise((resolve, reject) => {
    store.get(sid, (error, data) => {
      if (error != null) {
        reject(toError(error));
        return;
      }
      resolve(data ?? null);
    });
  });
}

function touchSession(store: MysqlSessionStore, sid: string, data: SessionData): Promise<void> {
  return new Promise((resolve, reject) => {
    store.touch(sid, data, (error) => error == null ? resolve() : reject(toError(error)));
  });
}

function destroySession(store: MysqlSessionStore, sid: string): Promise<void> {
  return new Promise((resolve, reject) => {
    store.destroy(sid, (error) => error == null ? resolve() : reject(toError(error)));
  });
}

interface ExpiresRow extends RowDataPacket {
  expires: number;
}

interface CountRow extends RowDataPacket {
  count: number;
}

function makeSession(expires: Date, extra: Record<string, string> = {}): SessionData {
  const cookie = new session.Cookie();
  cookie.expires = expires;
  return {
    cookie,
    ...extra
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

describe("MysqlSessionStore", () => {
  const store = new MysqlSessionStore(pool);

  beforeEach(async () => {
    await pool.query("DELETE FROM sessions");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("set 与 get 保存 JSON Session 数据", async () => {
    await setSession(store, "sid-1", makeSession(new Date(Date.now() + 60_000), {
      userId: "1",
      csrfToken: "token"
    }));

    await expect(getSession(store, "sid-1")).resolves.toMatchObject({
      userId: "1",
      csrfToken: "token"
    });
  });

  it("touch 延长过期时间", async () => {
    const earlier = new Date(Date.now() + 10_000);
    const later = new Date(Date.now() + 120_000);
    await setSession(store, "sid-touch", makeSession(earlier));
    await touchSession(store, "sid-touch", makeSession(later));

    const [rows] = await pool.query<ExpiresRow[]>(
      "SELECT expires FROM sessions WHERE session_id = ?",
      ["sid-touch"]
    );
    expect(rows[0]?.expires).toBeGreaterThan(earlier.getTime());
  });

  it("destroy 删除 Session", async () => {
    await setSession(store, "sid-delete", makeSession(new Date(Date.now() + 60_000)));
    await destroySession(store, "sid-delete");
    await expect(getSession(store, "sid-delete")).resolves.toBeNull();
  });

  it("过期 Session 返回空并清理旧行", async () => {
    await setSession(store, "sid-expired", makeSession(new Date(Date.now() - 1_000)));
    await expect(getSession(store, "sid-expired")).resolves.toBeNull();

    const [rows] = await pool.query<CountRow[]>(
      "SELECT COUNT(*) AS count FROM sessions WHERE session_id = ?",
      ["sid-expired"]
    );
    expect(rows[0]?.count).toBe(0);
  });
});
