import session, { type SessionData } from "express-session";
import type { Pool, RowDataPacket } from "mysql2/promise";

interface SessionRow extends RowDataPacket {
  expires: number;
  data: string;
}

export class MysqlSessionStore extends session.Store {
  constructor(private readonly pool: Pool) {
    super();
  }

  override get(sid: string, callback: (error: unknown, session?: SessionData | null) => void): void {
    void this.getSession(sid)
      .then((sessionData) => callback(null, sessionData))
      .catch((error: unknown) => callback(error));
  }

  override set(sid: string, sessionData: SessionData, callback?: (error?: unknown) => void): void {
    void this.setSession(sid, sessionData)
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override touch(sid: string, sessionData: SessionData, callback?: (error?: unknown) => void): void {
    void this.touchSession(sid, sessionData)
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override destroy(sid: string, callback?: (error?: unknown) => void): void {
    void this.destroySession(sid)
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  private async getSession(sid: string): Promise<SessionData | null> {
    const [rows] = await this.pool.query<SessionRow[]>(
      "SELECT expires, data FROM sessions WHERE session_id = ?",
      [sid]
    );
    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    if (row.expires <= Date.now()) {
      await this.destroySession(sid);
      return null;
    }

    const parsed = JSON.parse(row.data) as unknown;
    if (!isSessionData(parsed)) {
      return null;
    }
    return parsed;
  }

  private async setSession(sid: string, sessionData: SessionData): Promise<void> {
    await this.pool.execute(
      `INSERT INTO sessions (session_id, expires, data)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
      [sid, calculateExpires(sessionData), JSON.stringify(sessionData)]
    );
  }

  private async touchSession(sid: string, sessionData: SessionData): Promise<void> {
    await this.pool.execute(
      "UPDATE sessions SET expires = ? WHERE session_id = ?",
      [calculateExpires(sessionData), sid]
    );
  }

  private async destroySession(sid: string): Promise<void> {
    await this.pool.execute("DELETE FROM sessions WHERE session_id = ?", [sid]);
  }
}

function calculateExpires(sessionData: SessionData): number {
  const expires = sessionData.cookie.expires;
  if (expires instanceof Date) {
    return expires.getTime();
  }

  const maxAge = sessionData.cookie.maxAge;
  if (typeof maxAge === "number") {
    return Date.now() + maxAge;
  }

  return Date.now() + 24 * 60 * 60 * 1000;
}

function isSessionData(value: unknown): value is SessionData {
  return typeof value === "object" && value !== null && "cookie" in value;
}
