import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  Category,
  CategoryInput,
  CategoryStatus,
  OwnerProduct,
  OwnerProductInput,
  OwnerProductStockInput,
  PaginatedCategories,
  PaginatedOwnerProducts,
  ProductPriceHistory,
  ProductSearchQuery,
  ProductStatus,
  PublicProduct,
  PublicProductList,
  UploadProductImageResponse
} from "@novamall/shared";

import { AppError } from "../../errors/app-error.js";

interface CountRow extends RowDataPacket {
  total: number;
}

interface CategoryRow extends RowDataPacket {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface OwnerProductRow extends RowDataPacket {
  id: string;
  shop_id: string;
  category_id: string;
  category_name: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  main_image_path: string | null;
  status: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PublicProductRow extends RowDataPacket {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  main_image_path: string;
  category_id: string;
  category_name: string;
  shop_id: string;
  shop_name: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PriceHistoryRow extends RowDataPacket {
  id: string;
  product_id: string;
  old_price: string;
  new_price: string;
  changed_by: string | null;
  request_id: string | null;
  changed_at: Date | string;
}

interface OwnerShopRow extends RowDataPacket {
  id: string;
}

interface ProductStateRow extends RowDataPacket {
  id: string;
  status: string;
  category_id: string;
  main_image_path: string | null;
}

export interface PaginationQuery {
  page: number;
  pageSize: number;
}

export class CatalogRepository {
  constructor(private readonly pool: Pool, private readonly uploadRoot: string) {}

  async createCategory(input: CategoryInput): Promise<Category> {
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        "INSERT INTO categories (name, description) VALUES (?, ?)",
        [input.name, input.description]
      );
      const category = await this.findCategoryById(String(result.insertId));
      if (category === null) {
        throw new AppError(500, "INTERNAL_ERROR", "分类创建失败");
      }
      return category;
    } catch (error) {
      if (isMysqlErrorCode(error, "ER_DUP_ENTRY")) {
        throw new AppError(409, "CATEGORY_NAME_TAKEN", "分类名已被使用");
      }
      throw error;
    }
  }

  async listCategoriesForAdmin(query: PaginationQuery): Promise<PaginatedCategories> {
    const [countRows] = await this.pool.query<CountRow[]>("SELECT COUNT(*) AS total FROM categories");
    const [rows] = await this.pool.query<CategoryRow[]>(
      `${categorySelectSql}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT ? OFFSET ?`,
      [query.pageSize, (query.page - 1) * query.pageSize]
    );
    return {
      data: rows.map(mapCategory),
      meta: { page: query.page, pageSize: query.pageSize, total: countRows[0]?.total ?? 0 }
    };
  }

  async listActiveCategories(): Promise<Category[]> {
    const [rows] = await this.pool.query<CategoryRow[]>(
      `${categorySelectSql}
       WHERE c.status = 'ACTIVE'
       ORDER BY c.name ASC, c.id ASC`
    );
    return rows.map(mapCategory);
  }

  async updateCategory(id: string, input: CategoryInput): Promise<Category> {
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        "UPDATE categories SET name = ?, description = ? WHERE id = ?",
        [input.name, input.description, id]
      );
      if (result.affectedRows !== 1) {
        throw new AppError(404, "NOT_FOUND", "分类不存在");
      }
      const category = await this.findCategoryById(id);
      if (category === null) {
        throw new AppError(500, "INTERNAL_ERROR", "分类更新失败");
      }
      return category;
    } catch (error) {
      if (isMysqlErrorCode(error, "ER_DUP_ENTRY")) {
        throw new AppError(409, "CATEGORY_NAME_TAKEN", "分类名已被使用");
      }
      throw error;
    }
  }

  async setCategoryStatus(id: string, status: CategoryStatus): Promise<Category> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE categories SET status = ? WHERE id = ?",
      [status, id]
    );
    if (result.affectedRows !== 1) {
      throw new AppError(404, "NOT_FOUND", "分类不存在");
    }
    const category = await this.findCategoryById(id);
    if (category === null) {
      throw new AppError(500, "INTERNAL_ERROR", "分类状态更新失败");
    }
    return category;
  }

  async findOwnerShopId(ownerUserId: string): Promise<string> {
    const [rows] = await this.pool.query<OwnerShopRow[]>(
      "SELECT CAST(id AS CHAR) AS id FROM shops WHERE owner_user_id = ? AND status = 'ACTIVE'",
      [ownerUserId]
    );
    const id = rows[0]?.id;
    if (id === undefined) {
      throw new AppError(404, "NOT_FOUND", "店铺不存在");
    }
    return id;
  }

  async createOwnerProduct(ownerUserId: string, input: OwnerProductInput): Promise<OwnerProduct> {
    const shopId = await this.findOwnerShopId(ownerUserId);
    await this.assertCategoryActive(input.categoryId);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO products (shop_id, category_id, name, description, price, stock, main_image_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [shopId, input.categoryId, input.name, input.description, input.price, input.stock, input.mainImagePath ?? null]
    );
    const product = await this.findOwnerProduct(ownerUserId, String(result.insertId));
    if (product === null) {
      throw new AppError(500, "INTERNAL_ERROR", "商品创建失败");
    }
    return product;
  }

  async listOwnerProducts(ownerUserId: string, query: PaginationQuery): Promise<PaginatedOwnerProducts> {
    const shopId = await this.findOwnerShopId(ownerUserId);
    const [countRows] = await this.pool.query<CountRow[]>(
      "SELECT COUNT(*) AS total FROM products WHERE shop_id = ?",
      [shopId]
    );
    const [rows] = await this.pool.query<OwnerProductRow[]>(
      `${ownerProductSelectSql}
       WHERE p.shop_id = ?
       ORDER BY p.updated_at DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [shopId, query.pageSize, (query.page - 1) * query.pageSize]
    );
    return {
      data: rows.map(mapOwnerProduct),
      meta: { page: query.page, pageSize: query.pageSize, total: countRows[0]?.total ?? 0 }
    };
  }

  async findOwnerProduct(ownerUserId: string, productId: string): Promise<OwnerProduct | null> {
    const shopId = await this.findOwnerShopId(ownerUserId);
    const [rows] = await this.pool.query<OwnerProductRow[]>(
      `${ownerProductSelectSql}
       WHERE p.id = ? AND p.shop_id = ?`,
      [productId, shopId]
    );
    return rows[0] === undefined ? null : mapOwnerProduct(rows[0]);
  }

  async updateOwnerProduct(
    ownerUserId: string,
    productId: string,
    input: OwnerProductInput,
    requestId: string
  ): Promise<OwnerProduct> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await setAuditContext(connection, ownerUserId, requestId);
      const state = await this.findOwnerProductStateForUpdate(connection, ownerUserId, productId);
      if (state.status === "ARCHIVED") {
        throw new AppError(409, "PRODUCT_STATE_CONFLICT", "归档商品不能编辑");
      }
      await this.assertCategoryActive(input.categoryId, connection);
      await connection.execute(
        `UPDATE products
            SET category_id = ?,
                name = ?,
                description = ?,
                price = ?,
                stock = ?,
                main_image_path = ?,
                version = version + 1
          WHERE id = ?`,
        [input.categoryId, input.name, input.description, input.price, input.stock, input.mainImagePath ?? null, productId]
      );
      await connection.commit();
      const updated = await this.findOwnerProduct(ownerUserId, productId);
      if (updated === null) {
        throw new AppError(500, "INTERNAL_ERROR", "商品更新失败");
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

  async setOwnerProductStock(
    ownerUserId: string,
    productId: string,
    input: OwnerProductStockInput,
    requestId: string
  ): Promise<OwnerProduct> {
    const shopId = await this.findOwnerShopId(ownerUserId);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await setAuditContext(connection, ownerUserId, requestId);
      const state = await this.findOwnerProductStateForUpdate(connection, ownerUserId, productId);
      if (state.status === "ARCHIVED") {
        throw new AppError(409, "PRODUCT_STATE_CONFLICT", "归档商品不能调整库存");
      }
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE products
            SET stock = ?, version = version + 1
          WHERE id = ? AND shop_id = ? AND version = ?`,
        [input.stock, productId, shopId, input.version]
      );
      if (result.affectedRows !== 1) {
        throw new AppError(409, "PRODUCT_VERSION_CONFLICT", "商品版本已变化，请刷新后重试");
      }
      await connection.commit();
      const updated = await this.findOwnerProduct(ownerUserId, productId);
      if (updated === null) {
        throw new AppError(500, "INTERNAL_ERROR", "库存更新失败");
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

  async transitionOwnerProductStatus(
    ownerUserId: string,
    productId: string,
    nextStatus: ProductStatus,
    requestId: string
  ): Promise<OwnerProduct> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await setAuditContext(connection, ownerUserId, requestId);
      const state = await this.findOwnerProductStateForUpdate(connection, ownerUserId, productId);
      if (nextStatus === "PUBLISHED") {
        if (state.status !== "DRAFT" && state.status !== "UNPUBLISHED") {
          throw new AppError(409, "PRODUCT_STATE_CONFLICT", "当前商品状态不能上架");
        }
        if (state.main_image_path === null) {
          throw new AppError(409, "PRODUCT_STATE_CONFLICT", "商品上架前必须上传主图");
        }
        await this.assertCategoryActive(state.category_id, connection);
      } else if (nextStatus === "UNPUBLISHED") {
        if (state.status !== "PUBLISHED") {
          throw new AppError(409, "PRODUCT_STATE_CONFLICT", "当前商品状态不能下架");
        }
      } else if (nextStatus === "ARCHIVED") {
        if (state.status !== "DRAFT" && state.status !== "UNPUBLISHED") {
          throw new AppError(409, "PRODUCT_STATE_CONFLICT", "当前商品状态不能归档");
        }
      }
      await connection.execute(
        "UPDATE products SET status = ?, version = version + 1 WHERE id = ?",
        [nextStatus, productId]
      );
      await connection.commit();
      const updated = await this.findOwnerProduct(ownerUserId, productId);
      if (updated === null) {
        throw new AppError(500, "INTERNAL_ERROR", "商品状态更新失败");
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

  async listPriceHistory(ownerUserId: string, productId: string): Promise<ProductPriceHistory[]> {
    const product = await this.findOwnerProduct(ownerUserId, productId);
    if (product === null) {
      throw new AppError(404, "NOT_FOUND", "商品不存在");
    }
    const [rows] = await this.pool.query<PriceHistoryRow[]>(
      `SELECT
         CAST(id AS CHAR) AS id,
         CAST(product_id AS CHAR) AS product_id,
         CAST(old_price AS CHAR) AS old_price,
         CAST(new_price AS CHAR) AS new_price,
         CAST(changed_by AS CHAR) AS changed_by,
         request_id,
         changed_at
       FROM product_price_history
       WHERE product_id = ?
       ORDER BY changed_at DESC, id DESC`,
      [productId]
    );
    return rows.map(mapPriceHistory);
  }

  async listPublicProducts(query: ProductSearchQuery): Promise<PublicProductList> {
    const where: string[] = ["p.status = 'PUBLISHED'", "c.status = 'ACTIVE'", "s.status = 'ACTIVE'", "p.main_image_path IS NOT NULL"];
    const params: Array<string | number> = [];
    if (query.categoryId !== undefined) {
      where.push("p.category_id = ?");
      params.push(query.categoryId);
    }
    if (query.keyword !== undefined) {
      where.push("MATCH(p.name, p.description) AGAINST (? IN NATURAL LANGUAGE MODE)");
      params.push(query.keyword);
    }
    const orderSql = publicProductOrderSql(query.sort, query.keyword !== undefined);
    const orderParams = query.sort === "relevance" && query.keyword !== undefined ? [query.keyword] : [];
    const whereSql = `WHERE ${where.join(" AND ")}`;
    const [countRows] = await this.pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total
         FROM products p
         JOIN categories c ON c.id = p.category_id
         JOIN shops s ON s.id = p.shop_id
       ${whereSql}`,
      params
    );
    const [rows] = await this.pool.query<PublicProductRow[]>(
      `${publicProductSelectSql}
       ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`,
      [...params, ...orderParams, query.pageSize, (query.page - 1) * query.pageSize]
    );
    return {
      data: rows.map(mapPublicProduct),
      meta: { page: query.page, pageSize: query.pageSize, total: countRows[0]?.total ?? 0 }
    };
  }

  async findPublicProduct(productId: string): Promise<PublicProduct | null> {
    const [rows] = await this.pool.query<PublicProductRow[]>(
      `${publicProductSelectSql}
       WHERE p.id = ?
         AND p.status = 'PUBLISHED'
         AND c.status = 'ACTIVE'
         AND s.status = 'ACTIVE'
         AND p.main_image_path IS NOT NULL`,
      [productId]
    );
    return rows[0] === undefined ? null : mapPublicProduct(rows[0]);
  }

  async saveProductImage(file: { filepath: string; mimetype: string | null; originalFilename: string | null; size: number }): Promise<UploadProductImageResponse> {
    if (file.size > 2 * 1024 * 1024) {
      throw new AppError(400, "IMAGE_TOO_LARGE", "上传图片超过大小限制");
    }
    const buffer = await readFile(file.filepath);
    const ext = imageExtension(buffer, file.mimetype, file.originalFilename);
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const directory = join(this.uploadRoot, "products", year, month);
    const fileName = `${randomUUID()}.${ext}`;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, fileName), buffer);
    return { path: `/uploads/products/${year}/${month}/${fileName}` };
  }

  private async findCategoryById(id: string): Promise<Category | null> {
    const [rows] = await this.pool.query<CategoryRow[]>(
      `${categorySelectSql}
       WHERE c.id = ?`,
      [id]
    );
    return rows[0] === undefined ? null : mapCategory(rows[0]);
  }

  private async assertCategoryActive(categoryId: string, connection?: PoolConnection): Promise<void> {
    const executor = connection ?? this.pool;
    const [rows] = await executor.query<RowDataPacket[]>(
      "SELECT id FROM categories WHERE id = ? AND status = 'ACTIVE' LIMIT 1",
      [categoryId]
    );
    if (rows.length === 0) {
      throw new AppError(409, "PRODUCT_STATE_CONFLICT", "分类不可用");
    }
  }

  private async findOwnerProductStateForUpdate(
    connection: PoolConnection,
    ownerUserId: string,
    productId: string
  ): Promise<ProductStateRow> {
    const shopId = await this.findOwnerShopId(ownerUserId);
    const [rows] = await connection.query<ProductStateRow[]>(
      `SELECT CAST(id AS CHAR) AS id, status, CAST(category_id AS CHAR) AS category_id, main_image_path
         FROM products
        WHERE id = ? AND shop_id = ?
        FOR UPDATE`,
      [productId, shopId]
    );
    const row = rows[0];
    if (row === undefined) {
      throw new AppError(404, "NOT_FOUND", "商品不存在");
    }
    return row;
  }
}

const categorySelectSql = `SELECT
  CAST(c.id AS CHAR) AS id,
  c.name,
  c.description,
  c.status,
  c.created_at,
  c.updated_at
 FROM categories c`;

const ownerProductSelectSql = `SELECT
  CAST(p.id AS CHAR) AS id,
  CAST(p.shop_id AS CHAR) AS shop_id,
  CAST(p.category_id AS CHAR) AS category_id,
  c.name AS category_name,
  p.name,
  p.description,
  CAST(p.price AS CHAR) AS price,
  p.stock,
  p.main_image_path,
  p.status,
  p.version,
  p.created_at,
  p.updated_at
 FROM products p
 JOIN categories c ON c.id = p.category_id`;

const publicProductSelectSql = `SELECT
  CAST(p.id AS CHAR) AS id,
  p.name,
  p.description,
  CAST(p.price AS CHAR) AS price,
  p.stock,
  p.main_image_path,
  CAST(c.id AS CHAR) AS category_id,
  c.name AS category_name,
  CAST(s.id AS CHAR) AS shop_id,
  s.name AS shop_name,
  p.created_at,
  p.updated_at
 FROM products p
 JOIN categories c ON c.id = p.category_id
 JOIN shops s ON s.id = p.shop_id`;

async function setAuditContext(connection: PoolConnection, userId: string, requestId: string): Promise<void> {
  await connection.query("SET @novamall_actor_user_id = ?, @novamall_request_id = ?", [userId, requestId]);
}

async function clearAuditContext(connection: PoolConnection): Promise<void> {
  await connection.query("SET @novamall_actor_user_id = NULL, @novamall_request_id = NULL");
}

function publicProductOrderSql(sort: ProductSearchQuery["sort"], hasKeyword: boolean): string {
  if (sort === "priceAsc") {
    return "ORDER BY p.price ASC, p.id ASC";
  }
  if (sort === "priceDesc") {
    return "ORDER BY p.price DESC, p.id ASC";
  }
  if (sort === "relevance" && hasKeyword) {
    return "ORDER BY MATCH(p.name, p.description) AGAINST (? IN NATURAL LANGUAGE MODE) DESC, p.id DESC";
  }
  return "ORDER BY p.created_at DESC, p.id DESC";
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: parseCategoryStatus(row.status),
    createdAt: formatRequiredDate(row.created_at),
    updatedAt: formatRequiredDate(row.updated_at)
  };
}

function mapOwnerProduct(row: OwnerProductRow): OwnerProduct {
  return {
    id: row.id,
    shopId: row.shop_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    name: row.name,
    description: row.description,
    price: normalizeMoney(row.price),
    stock: row.stock,
    mainImagePath: row.main_image_path,
    status: parseProductStatus(row.status),
    version: row.version,
    createdAt: formatRequiredDate(row.created_at),
    updatedAt: formatRequiredDate(row.updated_at)
  };
}

function mapPublicProduct(row: PublicProductRow): PublicProduct {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: normalizeMoney(row.price),
    stock: row.stock,
    mainImagePath: row.main_image_path,
    category: { id: row.category_id, name: row.category_name },
    shop: { id: row.shop_id, name: row.shop_name },
    createdAt: formatRequiredDate(row.created_at),
    updatedAt: formatRequiredDate(row.updated_at)
  };
}

function mapPriceHistory(row: PriceHistoryRow): ProductPriceHistory {
  return {
    id: row.id,
    productId: row.product_id,
    oldPrice: normalizeMoney(row.old_price),
    newPrice: normalizeMoney(row.new_price),
    changedBy: row.changed_by,
    requestId: row.request_id,
    changedAt: formatRequiredDate(row.changed_at)
  };
}

function parseCategoryStatus(value: string): CategoryStatus {
  if (value === "ACTIVE" || value === "DISABLED") {
    return value;
  }
  throw new AppError(500, "INTERNAL_ERROR", "分类状态异常");
}

function parseProductStatus(value: string): ProductStatus {
  if (value === "DRAFT" || value === "PUBLISHED" || value === "UNPUBLISHED" || value === "ARCHIVED") {
    return value;
  }
  throw new AppError(500, "INTERNAL_ERROR", "商品状态异常");
}

function formatRequiredDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeMoney(value: string): string {
  return Number(value).toFixed(2);
}

function imageExtension(buffer: Buffer, mimetype: string | null, originalFilename: string | null): "jpg" | "png" | "webp" {
  if (mimetype === "image/png" && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return "png";
  }
  if (mimetype === "image/jpeg" && buffer.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) {
    return "jpg";
  }
  if (
    mimetype === "image/webp"
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  const suffix = originalFilename === null ? "" : extname(originalFilename).toLowerCase();
  if (suffix === ".png" || suffix === ".jpg" || suffix === ".jpeg" || suffix === ".webp") {
    throw new AppError(400, "INVALID_IMAGE_FILE", "上传文件内容不是有效图片");
  }
  throw new AppError(400, "INVALID_IMAGE_FILE", "只允许上传 JPG、PNG 或 WebP 图片");
}

function isMysqlErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === code;
}
