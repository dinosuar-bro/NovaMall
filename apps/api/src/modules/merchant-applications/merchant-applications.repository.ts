import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  AdminMerchantApplication,
  MerchantApplication,
  MerchantApplicationInput,
  MerchantApplicationRejectInput,
  MerchantApplicationStatus,
  PaginatedMerchantApplications,
  ShopSummary,
  ShopStatus
} from "@novamall/shared";

import { AppError } from "../../errors/app-error.js";

interface ApplicationRow extends RowDataPacket {
  id: string;
  shop_name: string;
  shop_description: string;
  status: string;
  reject_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  submitted_at: Date | string;
  updated_at: Date | string;
}

interface AdminApplicationRow extends ApplicationRow {
  user_id: string;
  username: string;
  display_name: string;
}

interface ShopRow extends RowDataPacket {
  id: string;
  name: string;
  description: string;
  status: string;
}

interface CountRow extends RowDataPacket {
  total: number;
}

export interface MerchantApplicationListQuery {
  page: number;
  pageSize: number;
  status?: MerchantApplicationStatus;
}

export class MerchantApplicationsRepository {
  constructor(private readonly pool: Pool) {}

  async findMine(userId: string): Promise<MerchantApplication | null> {
    const [rows] = await this.pool.query<ApplicationRow[]>(
      `${applicationSelectSql}
       WHERE ma.user_id = ?`,
      [userId]
    );
    return rows[0] === undefined ? null : mapApplication(rows[0]);
  }

  async submitForUser(userId: string, input: MerchantApplicationInput): Promise<MerchantApplication> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await assertShopNameAvailable(connection, input.shopName);
      const current = await findApplicationForUserForUpdate(connection, userId);

      let applicationId: string;
      if (current === null) {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO merchant_applications (user_id, shop_name, shop_description, status)
           VALUES (?, ?, ?, 'PENDING')`,
          [userId, input.shopName, input.shopDescription]
        );
        applicationId = String(result.insertId);
      } else if (current.status === "REJECTED") {
        await connection.execute(
          `UPDATE merchant_applications
              SET shop_name = ?,
                  shop_description = ?,
                  status = 'PENDING',
                  reject_reason = NULL,
                  reviewed_by = NULL,
                  reviewed_at = NULL,
                  submitted_at = CURRENT_TIMESTAMP(3)
            WHERE id = ?`,
          [input.shopName, input.shopDescription, current.id]
        );
        applicationId = current.id;
      } else {
        throw new AppError(409, "DUPLICATE_APPLICATION", "已有待审核或已批准的开店申请");
      }

      const application = await findApplicationById(connection, applicationId);
      if (application === null) {
        throw new AppError(500, "INTERNAL_ERROR", "开店申请保存失败");
      }
      await connection.commit();
      return application;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async listForAdmin(query: MerchantApplicationListQuery): Promise<PaginatedMerchantApplications> {
    const whereSql = query.status === undefined ? "" : "WHERE ma.status = ?";
    const whereParams = query.status === undefined ? [] : [query.status];
    const [countRows] = await this.pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total
         FROM merchant_applications ma
         ${whereSql}`,
      whereParams
    );
    const offset = (query.page - 1) * query.pageSize;
    const [rows] = await this.pool.query<AdminApplicationRow[]>(
      `${adminApplicationSelectSql}
       ${whereSql}
       ORDER BY ma.submitted_at DESC, ma.id DESC
       LIMIT ? OFFSET ?`,
      [...whereParams, query.pageSize, offset]
    );

    return {
      data: rows.map(mapAdminApplication),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: countRows[0]?.total ?? 0
      }
    };
  }

  async approve(applicationId: string, adminUserId: string, requestId: string): Promise<{
    application: Pick<MerchantApplication, "id" | "status">;
    shop: ShopSummary;
  }> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await setAuditContext(connection, adminUserId, requestId);
      const application = await findApplicationByIdForUpdate(connection, applicationId);
      if (application === null) {
        throw new AppError(404, "NOT_FOUND", "开店申请不存在");
      }
      if (application.status !== "PENDING") {
        throw new AppError(409, "APPLICATION_STATE_CONFLICT", "当前申请状态不允许审核");
      }

      let shopId: string;
      try {
        const [shopResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO shops (owner_user_id, name, description)
           VALUES (?, ?, ?)`,
          [application.userId, application.shopName, application.shopDescription]
        );
        shopId = String(shopResult.insertId);
      } catch (error) {
        if (isMysqlErrorCode(error, "ER_DUP_ENTRY")) {
          throw new AppError(409, "SHOP_NAME_TAKEN", "店铺名已被使用");
        }
        throw error;
      }

      await connection.execute(
        `INSERT IGNORE INTO user_roles (user_id, role_id, granted_by)
         SELECT ?, id, ? FROM roles WHERE code = 'OWNER'`,
        [application.userId, adminUserId]
      );
      const [updateResult] = await connection.execute<ResultSetHeader>(
        `UPDATE merchant_applications
            SET status = 'APPROVED',
                reject_reason = NULL,
                reviewed_by = ?,
                reviewed_at = CURRENT_TIMESTAMP(3)
          WHERE id = ? AND status = 'PENDING'`,
        [adminUserId, applicationId]
      );
      if (updateResult.affectedRows !== 1) {
        throw new AppError(409, "APPLICATION_STATE_CONFLICT", "当前申请状态不允许审核");
      }

      const shop = await findShopById(connection, shopId);
      if (shop === null) {
        throw new AppError(500, "INTERNAL_ERROR", "店铺创建失败");
      }
      await connection.commit();
      return {
        application: { id: applicationId, status: "APPROVED" },
        shop
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await clearAuditContext(connection);
      connection.release();
    }
  }

  async reject(
    applicationId: string,
    adminUserId: string,
    requestId: string,
    input: MerchantApplicationRejectInput
  ): Promise<MerchantApplication> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await setAuditContext(connection, adminUserId, requestId);
      const application = await findApplicationByIdForUpdate(connection, applicationId);
      if (application === null) {
        throw new AppError(404, "NOT_FOUND", "开店申请不存在");
      }
      if (application.status !== "PENDING") {
        throw new AppError(409, "APPLICATION_STATE_CONFLICT", "当前申请状态不允许审核");
      }

      await connection.execute(
        `UPDATE merchant_applications
            SET status = 'REJECTED',
                reject_reason = ?,
                reviewed_by = ?,
                reviewed_at = CURRENT_TIMESTAMP(3)
          WHERE id = ? AND status = 'PENDING'`,
        [input.reason, adminUserId, applicationId]
      );
      const updated = await findApplicationById(connection, applicationId);
      if (updated === null) {
        throw new AppError(500, "INTERNAL_ERROR", "开店申请审核失败");
      }
      await connection.commit();
      return updated;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await clearAuditContext(connection);
      connection.release();
    }
  }

  async findOwnerShop(ownerUserId: string): Promise<ShopSummary | null> {
    const [rows] = await this.pool.query<ShopRow[]>(
      `${shopSelectSql}
       WHERE owner_user_id = ?`,
      [ownerUserId]
    );
    return rows[0] === undefined ? null : mapShop(rows[0]);
  }
}

const applicationSelectSql = `SELECT
  CAST(ma.id AS CHAR) AS id,
  ma.shop_name,
  ma.shop_description,
  ma.status,
  ma.reject_reason,
  CAST(ma.reviewed_by AS CHAR) AS reviewed_by,
  ma.reviewed_at,
  ma.submitted_at,
  ma.updated_at
 FROM merchant_applications ma`;

const adminApplicationSelectSql = `SELECT
  CAST(ma.id AS CHAR) AS id,
  CAST(u.id AS CHAR) AS user_id,
  u.username,
  u.display_name,
  ma.shop_name,
  ma.shop_description,
  ma.status,
  ma.reject_reason,
  CAST(ma.reviewed_by AS CHAR) AS reviewed_by,
  ma.reviewed_at,
  ma.submitted_at,
  ma.updated_at
 FROM merchant_applications ma
 JOIN users u ON u.id = ma.user_id`;

const shopSelectSql = `SELECT
  CAST(id AS CHAR) AS id,
  name,
  description,
  status
 FROM shops`;

async function assertShopNameAvailable(connection: PoolConnection, shopName: string): Promise<void> {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT id FROM shops WHERE name = ? LIMIT 1",
    [shopName]
  );
  if (rows.length > 0) {
    throw new AppError(409, "SHOP_NAME_TAKEN", "店铺名已被使用");
  }
}

async function findApplicationForUserForUpdate(
  connection: PoolConnection,
  userId: string
): Promise<{ id: string; status: MerchantApplicationStatus } | null> {
  const [rows] = await connection.query<(RowDataPacket & { id: string; status: string })[]>(
    `SELECT CAST(id AS CHAR) AS id, status
       FROM merchant_applications
      WHERE user_id = ?
      FOR UPDATE`,
    [userId]
  );
  const row = rows[0];
  if (row === undefined || !isMerchantApplicationStatus(row.status)) {
    return null;
  }
  return { id: row.id, status: row.status };
}

async function findApplicationById(connection: PoolConnection, id: string): Promise<MerchantApplication | null> {
  const [rows] = await connection.query<ApplicationRow[]>(
    `${applicationSelectSql}
     WHERE ma.id = ?`,
    [id]
  );
  return rows[0] === undefined ? null : mapApplication(rows[0]);
}

async function findApplicationByIdForUpdate(
  connection: PoolConnection,
  id: string
): Promise<{
  id: string;
  userId: string;
  shopName: string;
  shopDescription: string;
  status: MerchantApplicationStatus;
} | null> {
  const [rows] = await connection.query<(RowDataPacket & {
    id: string;
    user_id: string;
    shop_name: string;
    shop_description: string;
    status: string;
  })[]>(
    `SELECT
       CAST(id AS CHAR) AS id,
       CAST(user_id AS CHAR) AS user_id,
       shop_name,
       shop_description,
       status
     FROM merchant_applications
     WHERE id = ?
     FOR UPDATE`,
    [id]
  );
  const row = rows[0];
  if (row === undefined || !isMerchantApplicationStatus(row.status)) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    shopName: row.shop_name,
    shopDescription: row.shop_description,
    status: row.status
  };
}

async function findShopById(connection: PoolConnection, id: string): Promise<ShopSummary | null> {
  const [rows] = await connection.query<ShopRow[]>(
    `${shopSelectSql}
     WHERE id = ?`,
    [id]
  );
  return rows[0] === undefined ? null : mapShop(rows[0]);
}

async function setAuditContext(connection: PoolConnection, userId: string, requestId: string): Promise<void> {
  await connection.query("SET @novamall_actor_user_id = ?, @novamall_request_id = ?", [userId, requestId]);
}

async function clearAuditContext(connection: PoolConnection): Promise<void> {
  await connection.query("SET @novamall_actor_user_id = NULL, @novamall_request_id = NULL");
}

function mapApplication(row: ApplicationRow): MerchantApplication {
  return {
    id: row.id,
    shopName: row.shop_name,
    shopDescription: row.shop_description,
    status: parseApplicationStatus(row.status),
    rejectReason: row.reject_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: formatDate(row.reviewed_at),
    submittedAt: formatRequiredDate(row.submitted_at),
    updatedAt: formatRequiredDate(row.updated_at)
  };
}

function mapAdminApplication(row: AdminApplicationRow): AdminMerchantApplication {
  return {
    ...mapApplication(row),
    user: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name
    }
  };
}

function mapShop(row: ShopRow): ShopSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: parseShopStatus(row.status)
  };
}

function parseApplicationStatus(value: string): MerchantApplicationStatus {
  if (isMerchantApplicationStatus(value)) {
    return value;
  }
  throw new AppError(500, "INTERNAL_ERROR", "开店申请状态异常");
}

function parseShopStatus(value: string): ShopStatus {
  if (value === "ACTIVE" || value === "SUSPENDED") {
    return value;
  }
  throw new AppError(500, "INTERNAL_ERROR", "店铺状态异常");
}

function isMerchantApplicationStatus(value: string): value is MerchantApplicationStatus {
  return value === "PENDING" || value === "APPROVED" || value === "REJECTED";
}

function formatRequiredDate(value: Date | string): string {
  return formatDate(value) ?? new Date(0).toISOString();
}

function formatDate(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isMysqlErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === code;
}
