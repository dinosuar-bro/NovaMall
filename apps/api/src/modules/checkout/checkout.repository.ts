import { randomBytes } from "node:crypto";

import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  Address,
  AddressInput,
  AuditLog,
  Cart,
  CartItemInput,
  CartItemUpdate,
  CheckoutInput,
  CheckoutResult,
  MemberOrder,
  ShopOrder,
  TopProduct
} from "@novamall/shared";

import { AppError } from "../../errors/app-error.js";

interface AddressRow extends RowDataPacket {
  id: string;
  receiver_name: string;
  receiver_phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  is_default: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CartItemRow extends RowDataPacket {
  id: string;
  product_id: string;
  product_name: string;
  shop_id: string;
  shop_name: string;
  unit_price: string;
  quantity: number;
  line_amount: string;
  stock: number;
  main_image_path: string | null;
  available: number;
}

interface MemberOrderRow extends RowDataPacket {
  order_no: string;
  status: string;
  total_amount: string;
  shop_order_count: number;
  created_at: Date | string;
}

interface ShopOrderRow extends RowDataPacket {
  shop_order_no: string;
  master_order_no: string;
  status: string;
  subtotal_amount: string;
  item_count: number;
  created_at: Date | string;
}

interface AuditLogRow extends RowDataPacket {
  id: string;
  actor_user_id: string | null;
  request_id: string | null;
  table_name: string;
  record_id: string;
  action: string;
  created_at: Date | string;
}

interface TopProductRow extends RowDataPacket {
  product_id: string;
  product_name: string;
  sold_quantity: number;
  sales_amount: string;
  sales_rank: number;
}

interface MasterOrderStateRow extends RowDataPacket {
  id: string;
  status: string;
}

interface ShopOrderStateRow extends RowDataPacket {
  id: string;
  master_order_id: string;
  status: string;
}

interface RemainingShopOrderRow extends RowDataPacket {
  count: number;
}

interface OutOrderNoRow extends RowDataPacket {
  order_no: string | null;
}

export class CheckoutRepository {
  constructor(
    private readonly pool: Pool,
    private readonly phoneAesKey: string
  ) {}

  async createAddress(userId: string, input: AddressInput): Promise<Address> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      if (input.isDefault) {
        await connection.execute("UPDATE addresses SET is_default = 0 WHERE user_id = ?", [userId]);
      }
      const iv = randomBytes(16);
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO addresses (
           user_id,
           receiver_name,
           receiver_phone_cipher,
           receiver_phone_iv,
           province,
           city,
           district,
           detail,
           is_default
         )
         VALUES (?, ?, AES_ENCRYPT(?, ?, ?), ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          input.receiverName,
          input.receiverPhone,
          this.phoneAesKey,
          iv,
          iv,
          input.province,
          input.city,
          input.district,
          input.detail,
          input.isDefault ? 1 : 0
        ]
      );
      await connection.commit();
      const address = await this.findAddressById(userId, String(result.insertId));
      if (address === null) {
        throw new AppError(500, "INTERNAL_ERROR", "地址创建失败");
      }
      return address;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async listAddresses(userId: string): Promise<Address[]> {
    const [rows] = await this.pool.query<AddressRow[]>(
      `${addressSelectSql}
       WHERE a.user_id = ?
       ORDER BY a.is_default DESC, a.created_at DESC, a.id DESC`,
      [this.phoneAesKey, userId]
    );
    return rows.map(mapAddress);
  }

  async getCart(userId: string): Promise<Cart> {
    const [rows] = await this.pool.query<CartItemRow[]>(
      `SELECT
         CAST(ci.id AS CHAR) AS id,
         CAST(p.id AS CHAR) AS product_id,
         p.name AS product_name,
         CAST(s.id AS CHAR) AS shop_id,
         s.name AS shop_name,
         CAST(p.price AS CHAR) AS unit_price,
         ci.quantity,
         CAST(p.price * ci.quantity AS CHAR) AS line_amount,
         p.stock,
         p.main_image_path,
         CASE
           WHEN p.status = 'PUBLISHED'
            AND c.status = 'ACTIVE'
            AND s.status = 'ACTIVE'
            AND p.main_image_path IS NOT NULL
           THEN 1 ELSE 0
         END AS available
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN categories c ON c.id = p.category_id
       JOIN shops s ON s.id = p.shop_id
       WHERE ci.user_id = ?
       ORDER BY ci.updated_at DESC, ci.id DESC`,
      [userId]
    );
    const items = rows.map(mapCartItem);
    return {
      items,
      totalAmount: normalizeMoney(sumMoney(items.map((item) => item.lineAmount)))
    };
  }

  async addCartItem(userId: string, input: CartItemInput): Promise<Cart> {
    await this.pool.execute(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [userId, input.productId, input.quantity]
    );
    return this.getCart(userId);
  }

  async updateCartItem(userId: string, itemId: string, input: CartItemUpdate): Promise<Cart> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?",
      [input.quantity, itemId, userId]
    );
    if (result.affectedRows !== 1) {
      throw new AppError(404, "NOT_FOUND", "购物车项不存在");
    }
    return this.getCart(userId);
  }

  async deleteCartItem(userId: string, itemId: string): Promise<Cart> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "DELETE FROM cart_items WHERE id = ? AND user_id = ?",
      [itemId, userId]
    );
    if (result.affectedRows !== 1) {
      throw new AppError(404, "NOT_FOUND", "购物车项不存在");
    }
    return this.getCart(userId);
  }

  async checkout(userId: string, input: CheckoutInput): Promise<CheckoutResult> {
    const connection = await this.pool.getConnection();
    try {
      await connection.query("CALL sp_checkout_cart(?, ?, ?, @novamall_checkout_order_no)", [
        userId,
        input.addressId,
        input.checkoutToken
      ]);
      const [rows] = await connection.query<OutOrderNoRow[]>(
        "SELECT @novamall_checkout_order_no AS order_no"
      );
      const orderNo = rows[0]?.order_no;
      if (orderNo === undefined || orderNo === null) {
        throw new AppError(500, "INTERNAL_ERROR", "结算未返回订单号");
      }
      return { orderNo };
    } catch (error) {
      throw mapCheckoutProcedureError(error);
    } finally {
      connection.release();
    }
  }

  async listMemberOrders(userId: string): Promise<MemberOrder[]> {
    const [rows] = await this.pool.query<MemberOrderRow[]>(
      `SELECT
         mo.order_no,
         mo.status,
         CAST(mo.total_amount AS CHAR) AS total_amount,
         COUNT(so.id) AS shop_order_count,
         mo.created_at
       FROM master_orders mo
       LEFT JOIN shop_orders so ON so.master_order_id = mo.id
       WHERE mo.buyer_user_id = ?
       GROUP BY mo.id, mo.order_no, mo.status, mo.total_amount, mo.created_at
       ORDER BY mo.created_at DESC, mo.id DESC`,
      [userId]
    );
    return rows.map(mapMemberOrder);
  }

  async listMemberShopOrders(userId: string): Promise<ShopOrder[]> {
    const [rows] = await this.pool.query<ShopOrderRow[]>(
      `${shopOrderSelectSql}
       WHERE mo.buyer_user_id = ?
       GROUP BY so.id, so.shop_order_no, mo.order_no, so.status, so.subtotal_amount, so.created_at
       ORDER BY so.created_at DESC, so.id DESC`,
      [userId]
    );
    return rows.map(mapShopOrder);
  }

  async payOrder(userId: string, orderNo: string, requestId: string): Promise<MemberOrder> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await setAuditContext(connection, userId, requestId);
      const order = await findMasterOrderForUpdate(connection, userId, orderNo);
      if (order === null) {
        throw new AppError(404, "NOT_FOUND", "订单不存在");
      }
      if (order.status !== "PENDING_PAYMENT" && order.status !== "PAID") {
        throw new AppError(409, "ORDER_STATE_CONFLICT", "当前订单状态不能支付");
      }
      if (order.status === "PENDING_PAYMENT") {
        await connection.execute(
          "UPDATE master_orders SET status = 'PAID', paid_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
          [order.id]
        );
        await connection.execute(
          "UPDATE shop_orders SET status = 'PENDING_SHIPMENT', paid_at = CURRENT_TIMESTAMP(3) WHERE master_order_id = ?",
          [order.id]
        );
        await connection.execute(
          "UPDATE payments SET status = 'PAID', paid_at = CURRENT_TIMESTAMP(3) WHERE master_order_id = ?",
          [order.id]
        );
      }
      await connection.commit();
      const updated = await this.findMemberOrderByNo(userId, orderNo);
      if (updated === null) {
        throw new AppError(500, "INTERNAL_ERROR", "支付后订单查询失败");
      }
      return updated;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await clearAuditContext(connection);
      connection.release();
    }
  }

  async cancelOrder(userId: string, orderNo: string, requestId: string): Promise<MemberOrder> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await setAuditContext(connection, userId, requestId);
      const order = await findMasterOrderForUpdate(connection, userId, orderNo);
      if (order === null) {
        throw new AppError(404, "NOT_FOUND", "订单不存在");
      }
      if (order.status !== "PENDING_PAYMENT") {
        throw new AppError(409, "ORDER_STATE_CONFLICT", "当前订单状态不能取消");
      }
      await connection.execute(
        `UPDATE products p
           JOIN order_items oi ON oi.product_id = p.id
           JOIN shop_orders so ON so.id = oi.shop_order_id
            SET p.stock = p.stock + oi.quantity,
                p.version = p.version + 1
         WHERE so.master_order_id = ?`,
        [order.id]
      );
      await connection.execute(
        "UPDATE shop_orders SET status = 'CANCELED', canceled_at = CURRENT_TIMESTAMP(3) WHERE master_order_id = ?",
        [order.id]
      );
      await connection.execute(
        "UPDATE payments SET status = 'CANCELED' WHERE master_order_id = ?",
        [order.id]
      );
      await connection.execute(
        "UPDATE master_orders SET status = 'CANCELED', canceled_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
        [order.id]
      );
      await connection.commit();
      const updated = await this.findMemberOrderByNo(userId, orderNo);
      if (updated === null) {
        throw new AppError(500, "INTERNAL_ERROR", "取消后订单查询失败");
      }
      return updated;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await clearAuditContext(connection);
      connection.release();
    }
  }

  async listOwnerShopOrders(ownerUserId: string): Promise<ShopOrder[]> {
    const [rows] = await this.pool.query<ShopOrderRow[]>(
      `SELECT
         so.shop_order_no,
         mo.order_no AS master_order_no,
         so.status,
         CAST(so.subtotal_amount AS CHAR) AS subtotal_amount,
         COALESCE(SUM(oi.quantity), 0) AS item_count,
         so.created_at
       FROM shops s
       JOIN shop_orders so ON so.shop_id = s.id
       JOIN master_orders mo ON mo.id = so.master_order_id
       LEFT JOIN order_items oi ON oi.shop_order_id = so.id
       WHERE s.owner_user_id = ?
       GROUP BY so.id, so.shop_order_no, mo.order_no, so.status, so.subtotal_amount, so.created_at
       ORDER BY so.created_at DESC, so.id DESC`,
      [ownerUserId]
    );
    return rows.map(mapShopOrder);
  }

  async shipShopOrder(ownerUserId: string, shopOrderNo: string, requestId: string): Promise<ShopOrder> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await setAuditContext(connection, ownerUserId, requestId);
      const shopOrder = await findOwnerShopOrderForUpdate(connection, ownerUserId, shopOrderNo);
      if (shopOrder === null) {
        throw new AppError(404, "NOT_FOUND", "子订单不存在");
      }
      if (shopOrder.status !== "PENDING_SHIPMENT") {
        throw new AppError(409, "ORDER_STATE_CONFLICT", "当前子订单状态不能发货");
      }
      await connection.execute(
        "UPDATE shop_orders SET status = 'SHIPPED', shipped_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
        [shopOrder.id]
      );
      await connection.commit();
      const updated = await this.findOwnerShopOrderByNo(ownerUserId, shopOrderNo);
      if (updated === null) {
        throw new AppError(500, "INTERNAL_ERROR", "发货后子订单查询失败");
      }
      return updated;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await clearAuditContext(connection);
      connection.release();
    }
  }

  async confirmShopOrder(userId: string, shopOrderNo: string, requestId: string): Promise<ShopOrder> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await setAuditContext(connection, userId, requestId);
      const shopOrder = await findMemberShopOrderForUpdate(connection, userId, shopOrderNo);
      if (shopOrder === null) {
        throw new AppError(404, "NOT_FOUND", "子订单不存在");
      }
      if (shopOrder.status !== "SHIPPED") {
        throw new AppError(409, "ORDER_STATE_CONFLICT", "当前子订单状态不能确认收货");
      }
      await connection.execute(
        "UPDATE shop_orders SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
        [shopOrder.id]
      );
      const [remainingRows] = await connection.query<RemainingShopOrderRow[]>(
        "SELECT COUNT(*) AS count FROM shop_orders WHERE master_order_id = ? AND status <> 'COMPLETED'",
        [shopOrder.master_order_id]
      );
      if ((remainingRows[0]?.count ?? 0) === 0) {
        await connection.execute(
          "UPDATE master_orders SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
          [shopOrder.master_order_id]
        );
      }
      await connection.commit();
      const updated = await this.findMemberShopOrderByNo(userId, shopOrderNo);
      if (updated === null) {
        throw new AppError(500, "INTERNAL_ERROR", "确认收货后子订单查询失败");
      }
      return updated;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await clearAuditContext(connection);
      connection.release();
    }
  }

  async listAuditLogs(): Promise<AuditLog[]> {
    const [rows] = await this.pool.query<AuditLogRow[]>(
      `SELECT
         CAST(id AS CHAR) AS id,
         CAST(actor_user_id AS CHAR) AS actor_user_id,
         request_id,
         table_name,
         CAST(record_id AS CHAR) AS record_id,
         action,
         created_at
       FROM audit_logs
       ORDER BY created_at DESC, id DESC
       LIMIT 50`
    );
    return rows.map(mapAuditLog);
  }

  async listTopProducts(): Promise<TopProduct[]> {
    const [rows] = await this.pool.query<TopProductRow[]>(
      `SELECT product_id, product_name, sold_quantity, sales_amount, sales_rank
         FROM (
           SELECT
             product_id,
             product_name,
             sold_quantity,
             sales_amount,
             ROW_NUMBER() OVER (ORDER BY sold_quantity DESC, product_id ASC) AS sales_rank
           FROM v_effective_product_sales
         ) ranked
       WHERE sales_rank <= 10
       ORDER BY sales_rank`
    );
    return rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      soldQuantity: Number(row.sold_quantity),
      salesAmount: normalizeMoney(row.sales_amount),
      salesRank: row.sales_rank
    }));
  }

  private async findAddressById(userId: string, addressId: string): Promise<Address | null> {
    const [rows] = await this.pool.query<AddressRow[]>(
      `${addressSelectSql}
       WHERE a.user_id = ? AND a.id = ?`,
      [this.phoneAesKey, userId, addressId]
    );
    return rows[0] === undefined ? null : mapAddress(rows[0]);
  }

  private async findMemberOrderByNo(userId: string, orderNo: string): Promise<MemberOrder | null> {
    const [rows] = await this.pool.query<MemberOrderRow[]>(
      `SELECT
         mo.order_no,
         mo.status,
         CAST(mo.total_amount AS CHAR) AS total_amount,
         COUNT(so.id) AS shop_order_count,
         mo.created_at
       FROM master_orders mo
       LEFT JOIN shop_orders so ON so.master_order_id = mo.id
       WHERE mo.buyer_user_id = ? AND mo.order_no = ?
       GROUP BY mo.id, mo.order_no, mo.status, mo.total_amount, mo.created_at`,
      [userId, orderNo]
    );
    return rows[0] === undefined ? null : mapMemberOrder(rows[0]);
  }

  private async findOwnerShopOrderByNo(ownerUserId: string, shopOrderNo: string): Promise<ShopOrder | null> {
    const [rows] = await this.pool.query<ShopOrderRow[]>(
      `${shopOrderSelectSql}
       WHERE s.owner_user_id = ? AND so.shop_order_no = ?
       GROUP BY so.id, so.shop_order_no, mo.order_no, so.status, so.subtotal_amount, so.created_at`,
      [ownerUserId, shopOrderNo]
    );
    return rows[0] === undefined ? null : mapShopOrder(rows[0]);
  }

  private async findMemberShopOrderByNo(userId: string, shopOrderNo: string): Promise<ShopOrder | null> {
    const [rows] = await this.pool.query<ShopOrderRow[]>(
      `${shopOrderSelectSql}
       WHERE mo.buyer_user_id = ? AND so.shop_order_no = ?
       GROUP BY so.id, so.shop_order_no, mo.order_no, so.status, so.subtotal_amount, so.created_at`,
      [userId, shopOrderNo]
    );
    return rows[0] === undefined ? null : mapShopOrder(rows[0]);
  }
}

const addressSelectSql = `SELECT
  CAST(a.id AS CHAR) AS id,
  a.receiver_name,
  COALESCE(CAST(AES_DECRYPT(a.receiver_phone_cipher, ?, a.receiver_phone_iv) AS CHAR CHARACTER SET utf8mb4), '') AS receiver_phone,
  a.province,
  a.city,
  a.district,
  a.detail,
  a.is_default,
  a.created_at,
  a.updated_at
 FROM addresses a`;

const shopOrderSelectSql = `SELECT
  so.shop_order_no,
  mo.order_no AS master_order_no,
  so.status,
  CAST(so.subtotal_amount AS CHAR) AS subtotal_amount,
  COALESCE(SUM(oi.quantity), 0) AS item_count,
  so.created_at
 FROM shops s
 JOIN shop_orders so ON so.shop_id = s.id
 JOIN master_orders mo ON mo.id = so.master_order_id
 LEFT JOIN order_items oi ON oi.shop_order_id = so.id`;

async function findMasterOrderForUpdate(
  connection: PoolConnection,
  userId: string,
  orderNo: string
): Promise<MasterOrderStateRow | null> {
  const [rows] = await connection.query<MasterOrderStateRow[]>(
    `SELECT CAST(id AS CHAR) AS id, status
       FROM master_orders
      WHERE buyer_user_id = ? AND order_no = ?
      FOR UPDATE`,
    [userId, orderNo]
  );
  return rows[0] ?? null;
}

async function findOwnerShopOrderForUpdate(
  connection: PoolConnection,
  ownerUserId: string,
  shopOrderNo: string
): Promise<ShopOrderStateRow | null> {
  const [rows] = await connection.query<ShopOrderStateRow[]>(
    `SELECT CAST(so.id AS CHAR) AS id,
            CAST(so.master_order_id AS CHAR) AS master_order_id,
            so.status
       FROM shop_orders so
       JOIN shops s ON s.id = so.shop_id
      WHERE s.owner_user_id = ? AND so.shop_order_no = ?
      FOR UPDATE`,
    [ownerUserId, shopOrderNo]
  );
  return rows[0] ?? null;
}

async function findMemberShopOrderForUpdate(
  connection: PoolConnection,
  userId: string,
  shopOrderNo: string
): Promise<ShopOrderStateRow | null> {
  const [rows] = await connection.query<ShopOrderStateRow[]>(
    `SELECT CAST(so.id AS CHAR) AS id,
            CAST(so.master_order_id AS CHAR) AS master_order_id,
            so.status
       FROM shop_orders so
       JOIN master_orders mo ON mo.id = so.master_order_id
      WHERE mo.buyer_user_id = ? AND so.shop_order_no = ?
      FOR UPDATE`,
    [userId, shopOrderNo]
  );
  return rows[0] ?? null;
}

async function setAuditContext(connection: PoolConnection, userId: string, requestId: string): Promise<void> {
  await connection.query("SET @novamall_actor_user_id = ?, @novamall_request_id = ?", [userId, requestId]);
}

async function clearAuditContext(connection: PoolConnection): Promise<void> {
  await connection.query("SET @novamall_actor_user_id = NULL, @novamall_request_id = NULL");
}

function mapAddress(row: AddressRow): Address {
  return {
    id: row.id,
    receiverName: row.receiver_name,
    maskedPhone: maskPhone(row.receiver_phone),
    province: row.province,
    city: row.city,
    district: row.district,
    detail: row.detail,
    isDefault: row.is_default === 1,
    createdAt: formatRequiredDate(row.created_at),
    updatedAt: formatRequiredDate(row.updated_at)
  };
}

function mapCartItem(row: CartItemRow): Cart["items"][number] {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    shopId: row.shop_id,
    shopName: row.shop_name,
    unitPrice: normalizeMoney(row.unit_price),
    quantity: row.quantity,
    lineAmount: normalizeMoney(row.line_amount),
    stock: row.stock,
    mainImagePath: row.main_image_path,
    available: row.available === 1
  };
}

function mapMemberOrder(row: MemberOrderRow): MemberOrder {
  return {
    orderNo: row.order_no,
    status: parseMasterOrderStatus(row.status),
    totalAmount: normalizeMoney(row.total_amount),
    shopOrderCount: Number(row.shop_order_count),
    createdAt: formatRequiredDate(row.created_at)
  };
}

function mapShopOrder(row: ShopOrderRow): ShopOrder {
  return {
    shopOrderNo: row.shop_order_no,
    masterOrderNo: row.master_order_no,
    status: parseShopOrderStatus(row.status),
    subtotalAmount: normalizeMoney(row.subtotal_amount),
    itemCount: Number(row.item_count),
    createdAt: formatRequiredDate(row.created_at)
  };
}

function mapAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    requestId: row.request_id,
    tableName: row.table_name,
    recordId: row.record_id,
    action: row.action,
    createdAt: formatRequiredDate(row.created_at)
  };
}

function maskPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : "";
}

function normalizeMoney(value: string | number): string {
  return Number(value).toFixed(2);
}

function sumMoney(values: string[]): number {
  return values.reduce((total, value) => total + Number(value), 0);
}

function formatRequiredDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseMasterOrderStatus(value: string): MemberOrder["status"] {
  if (value === "PENDING_PAYMENT" || value === "PAID" || value === "CANCELED" || value === "COMPLETED") {
    return value;
  }
  throw new AppError(500, "INTERNAL_ERROR", "总订单状态异常");
}

function parseShopOrderStatus(value: string): ShopOrder["status"] {
  if (
    value === "PENDING_PAYMENT"
    || value === "PENDING_SHIPMENT"
    || value === "SHIPPED"
    || value === "COMPLETED"
    || value === "CANCELED"
    || value === "REFUNDED"
  ) {
    return value;
  }
  throw new AppError(500, "INTERNAL_ERROR", "子订单状态异常");
}

function mapCheckoutProcedureError(error: unknown): unknown {
  const message = mysqlMessage(error);
  if (message === "EMPTY_CART") {
    return new AppError(409, "EMPTY_CART", "购物车为空");
  }
  if (message === "ADDRESS_NOT_OWNED") {
    return new AppError(403, "ADDRESS_NOT_OWNED", "地址不属于当前会员");
  }
  if (message === "PRODUCT_UNAVAILABLE") {
    return new AppError(409, "PRODUCT_UNAVAILABLE", "商品不可售");
  }
  if (message === "OUT_OF_STOCK") {
    return new AppError(409, "OUT_OF_STOCK", "库存不足");
  }
  return error;
}

function mysqlMessage(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "sqlMessage" in error && typeof error.sqlMessage === "string") {
    return error.sqlMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return null;
}
