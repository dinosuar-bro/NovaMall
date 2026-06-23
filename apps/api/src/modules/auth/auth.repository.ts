import { randomBytes } from "node:crypto";

import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { RoleCode } from "@novamall/shared";

import { AppError } from "../../errors/app-error.js";

interface CreateMemberInput {
  username: string;
  passwordHash: string;
  displayName: string;
  phone: string;
}

interface AuthUserRecord {
  id: string;
  username: string;
  displayName: string;
  roles: RoleCode[];
}

interface PrivateProfileRecord extends AuthUserRecord {
  phone: string;
}

interface AuthUserRow extends RowDataPacket {
  id: string;
  username: string;
  display_name: string;
  roles: string;
}

interface PrivateProfileRow extends AuthUserRow {
  phone: string;
}

interface CredentialRow extends AuthUserRow {
  password_hash: string;
  status: string;
}

export interface CredentialRecord extends AuthUserRecord {
  passwordHash: string;
  status: "ACTIVE" | "DISABLED";
}

export class AuthRepository {
  constructor(
    private readonly pool: Pool,
    private readonly phoneAesKey: string
  ) {}

  async createMember(input: CreateMemberInput): Promise<AuthUserRecord> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const userId = await this.insertUser(connection, input);
      await connection.execute(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT ?, id FROM roles WHERE code = 'MEMBER'`,
        [userId]
      );
      await connection.commit();
      return {
        id: String(userId),
        username: input.username,
        displayName: input.displayName,
        roles: ["MEMBER"]
      };
    } catch (error) {
      await connection.rollback();
      if (isMysqlErrorCode(error, "ER_DUP_ENTRY")) {
        throw new AppError(409, "USERNAME_TAKEN", "用户名已被使用");
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async findPrivateProfileById(id: string): Promise<PrivateProfileRecord | null> {
    const [rows] = await this.pool.query<PrivateProfileRow[]>(
      `SELECT
         CAST(u.id AS CHAR) AS id,
         u.username,
         u.display_name,
         CAST(AES_DECRYPT(u.phone_cipher, ?, u.phone_iv) AS CHAR CHARACTER SET utf8mb4) AS phone,
         GROUP_CONCAT(r.code ORDER BY r.code SEPARATOR ',') AS roles
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ?
       GROUP BY u.id, u.username, u.display_name, u.phone_cipher, u.phone_iv`,
      [this.phoneAesKey, id]
    );
    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      phone: row.phone,
      roles: parseRoles(row.roles)
    };
  }

  async findAuthUserById(id: string): Promise<AuthUserRecord | null> {
    const [rows] = await this.pool.query<AuthUserRow[]>(
      `SELECT
         CAST(u.id AS CHAR) AS id,
         u.username,
         u.display_name,
         GROUP_CONCAT(r.code ORDER BY r.code SEPARATOR ',') AS roles
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ? AND u.status = 'ACTIVE'
       GROUP BY u.id, u.username, u.display_name`,
      [id]
    );
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      roles: parseRoles(row.roles)
    };
  }

  async findCredentialByUsername(username: string): Promise<CredentialRecord | null> {
    const [rows] = await this.pool.query<CredentialRow[]>(
      `SELECT
         CAST(u.id AS CHAR) AS id,
         u.username,
         u.password_hash,
         u.display_name,
         u.status,
         GROUP_CONCAT(r.code ORDER BY r.code SEPARATOR ',') AS roles
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.username = ?
       GROUP BY u.id, u.username, u.password_hash, u.display_name, u.status`,
      [username]
    );
    const row = rows[0];
    if (row === undefined || !isAccountStatus(row.status)) {
      return null;
    }
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      displayName: row.display_name,
      status: row.status,
      roles: parseRoles(row.roles)
    };
  }

  private async insertUser(connection: PoolConnection, input: CreateMemberInput): Promise<number> {
    const phoneIv = randomBytes(16);
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO users (username, password_hash, display_name, phone_cipher, phone_iv)
       VALUES (?, ?, ?, AES_ENCRYPT(?, ?, ?), ?)`,
      [
        input.username,
        input.passwordHash,
        input.displayName,
        input.phone,
        this.phoneAesKey,
        phoneIv,
        phoneIv
      ]
    );
    return result.insertId;
  }
}

function parseRoles(value: string): RoleCode[] {
  return value.split(",").filter(isRoleCode);
}

function isRoleCode(value: string): value is RoleCode {
  return value === "MEMBER" || value === "OWNER" || value === "ADMIN";
}

function isAccountStatus(value: string): value is "ACTIVE" | "DISABLED" {
  return value === "ACTIVE" || value === "DISABLED";
}

function isMysqlErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === code;
}
