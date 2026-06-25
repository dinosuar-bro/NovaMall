# Stage 3：商品目录闭环规格

## 1. 阶段目标

在 Stage 2 已完成商户入驻、单店店铺和 OWNER 角色的基础上，交付商品目录的最小业务闭环：管理员维护平台分类，店主在自己的店铺内创建和维护商品，上传商品主图，公开用户可按分类和中文关键词搜索上架商品并查看详情。

本阶段重点展示分类、商品、图片上传、价格历史、商品审计、复合索引和中文全文检索。购物车、订单、销量排行、复杂 SKU、促销、收藏和评价不属于本阶段。

## 2. 成功标准

- 从 Stage 2 数据库继续执行迁移，新增 `categories`、`products` 和 `product_price_history`；
- 管理员可创建、修改、启用和停用分类；
- 店主只能管理自己店铺的商品，不能读取或修改其他店铺商品；
- 店主可创建草稿商品，编辑名称、简介、分类、价格、库存和主图；
- 店主可将草稿或已下架商品上架，可下架已上架商品，可归档非公开商品；
- 商品价格变化自动写入 `product_price_history`；
- 商品价格、库存和状态变化写入 `audit_logs`，审计内容不包含密码、手机号、Cookie 或密钥；
- 公开商品列表只展示上架商品、启用分类和营业中店铺；
- 公开商品列表支持分类筛选、中文关键词搜索和价格/时间排序；
- 商品详情只允许查看公开可售商品；
- 非图片文件、伪装图片和超限文件被拒绝；
- 数据库包含商品查询复合索引和 `FULLTEXT(name, description) WITH PARSER ngram`；
- 保存索引和全文检索的初步实验记录，结果必须来自真实命令。

## 3. 非目标

- 购物车、结算、订单和支付；
- 销量 Top 10 的真实统计；
- 多规格 SKU、多图相册、图片裁剪和对象存储；
- 分类树、多级分类排序和批量导入；
- 店铺 Logo 上传；
- 管理员直接编辑店主商品；
- 富文本详情、商品评价、收藏、推荐和促销。

## 4. 数据库设计

### 4.1 categories

```sql
CREATE TABLE categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name),
  KEY idx_categories_status_name (status, name, id),
  CONSTRAINT chk_categories_status CHECK (status IN ('ACTIVE', 'DISABLED')),
  CONSTRAINT chk_categories_name_non_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_categories_description_non_empty CHECK (CHAR_LENGTH(TRIM(description)) > 0)
);
```

停用分类不自动下架商品。公开商品查询必须同时要求分类 `ACTIVE`。

### 4.2 products

```sql
CREATE TABLE products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  main_image_path VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_products_category_status_id (category_id, status, id),
  KEY idx_products_shop_status_updated (shop_id, status, updated_at, id),
  KEY idx_products_status_updated (status, updated_at, id),
  FULLTEXT KEY ft_products_name_description (name, description) WITH PARSER ngram,
  CONSTRAINT fk_products_shop
    FOREIGN KEY (shop_id) REFERENCES shops (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_products_category
    FOREIGN KEY (category_id) REFERENCES categories (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_products_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED')),
  CONSTRAINT chk_products_name_non_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_products_description_non_empty CHECK (CHAR_LENGTH(TRIM(description)) > 0),
  CONSTRAINT chk_products_price_positive CHECK (price > 0)
);
```

状态规则：

- `DRAFT`：初始草稿，不出现在公开列表；
- `PUBLISHED`：公开展示，要求分类启用、店铺营业中、主图存在、库存可为 0；
- `UNPUBLISHED`：店主主动下架，可重新编辑和上架；
- `ARCHIVED`：归档终态，不出现在公开列表，不能再次上架。

`version` 用于库存和编辑冲突检测。库存接口接收目标库存和当前版本，版本不一致返回冲突错误，防止后台页面覆盖新库存。

### 4.3 product_price_history

```sql
CREATE TABLE product_price_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  old_price DECIMAL(10, 2) NOT NULL,
  new_price DECIMAL(10, 2) NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  request_id CHAR(36) NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_product_price_history_product_changed (product_id, changed_at, id),
  CONSTRAINT fk_product_price_history_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_product_price_history_changed_by
    FOREIGN KEY (changed_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE SET NULL
);
```

`AFTER UPDATE ON products` 触发器在 `OLD.price <> NEW.price` 时写入价格历史。触发器读取会话变量 `@novamall_actor_user_id` 和 `@novamall_request_id`。

### 4.4 商品审计

商品触发器在价格、库存或状态变化时追加 `audit_logs`：

- `table_name = 'products'`;
- `record_id = products.id`;
- `action = 'UPDATE'`；
- `old_data` 和 `new_data` 仅包含 `price`、`stock`、`status`、`categoryId`、`name` 和 `mainImagePath`。

## 5. API 合同

所有路径继承 `/api/v1`，成功和错误结构遵循 `docs/api.md`。所有写请求必须携带 `X-CSRF-Token`。

### 5.1 公开接口

| 方法 | 路径 | 角色 | 行为 |
|---|---|---|---|
| GET | `/categories` | 公开 | 返回启用分类列表 |
| GET | `/products` | 公开 | 商品分页、分类筛选、关键词搜索和排序 |
| GET | `/products/:productId` | 公开 | 返回公开商品详情 |

`GET /products` 查询参数：

- `page`：默认 1；
- `pageSize`：默认 20，最大 60；
- `categoryId`：可选，数字字符串；
- `keyword`：可选，1-80 个字符，前后空白会裁剪；
- `sort`：`newest`、`priceAsc`、`priceDesc`、`relevance`。

无关键词时不允许使用 `relevance` 排序。公开商品 DTO 包含商品、分类和店铺摘要，金额以两位小数字符串返回。

### 5.2 管理员分类接口

| 方法 | 路径 | 角色 | 行为 |
|---|---|---|---|
| GET | `/admin/categories` | ADMIN | 分类分页 |
| POST | `/admin/categories` | ADMIN + CSRF | 创建分类 |
| PATCH | `/admin/categories/:id` | ADMIN + CSRF | 修改名称和简介 |
| POST | `/admin/categories/:id/disable` | ADMIN + CSRF | 停用分类 |
| POST | `/admin/categories/:id/enable` | ADMIN + CSRF | 启用分类 |

分类名全平台唯一。重复分类名返回 `CATEGORY_NAME_TAKEN`。

### 5.3 店主商品接口

| 方法 | 路径 | 角色 | 行为 |
|---|---|---|---|
| GET | `/owner/products` | OWNER | 本店商品分页 |
| POST | `/owner/products` | OWNER + CSRF | 新增草稿商品 |
| GET | `/owner/products/:productId` | OWNER | 本店商品详情 |
| PATCH | `/owner/products/:productId` | OWNER + CSRF | 编辑基础字段 |
| PATCH | `/owner/products/:productId/stock` | OWNER + CSRF | 设置库存 |
| POST | `/owner/products/:productId/publish` | OWNER + CSRF | 上架商品 |
| POST | `/owner/products/:productId/unpublish` | OWNER + CSRF | 下架商品 |
| POST | `/owner/products/:productId/archive` | OWNER + CSRF | 归档商品 |
| GET | `/owner/products/:productId/price-history` | OWNER | 查看价格历史 |
| POST | `/uploads/products` | OWNER + CSRF | 上传商品图片 |

所有店主商品查询和更新条件必须包含当前店主的 `shop_id`。跨店商品统一返回 `RESOURCE_NOT_OWNED` 或 `NOT_FOUND`，不泄露其他店铺商品详情。

## 6. 上传规则

- 接收字段名：`image`；
- 最大体积：2 MB；
- 允许 MIME：`image/jpeg`、`image/png`、`image/webp`；
- 同时检查文件魔数，不只相信客户端 MIME；
- 保存路径：`uploads/products/YYYY/MM/<uuid>.<ext>`；
- API 返回相对公开路径：`/uploads/products/YYYY/MM/<uuid>.<ext>`；
- 文件名不使用用户上传的原始名称；
- 上传成功但后续商品更新失败时，不删除已上传文件，本阶段不实现孤儿文件清理；
- Nginx 或 Express 静态服务只暴露 `/uploads/products`，不得执行上传内容。

## 7. 前端范围

### 7.1 管理员

管理员工作区增加分类管理面板：

- 分类列表、创建分类；
- 启用和停用操作；
- 空状态、加载状态和错误状态；
- 重复分类名和非法输入提示。

### 7.2 店主

店主工作区增加商品管理面板：

- 本店商品列表；
- 新增草稿和编辑商品；
- 上传并设置主图；
- 设置库存；
- 上架、下架、归档；
- 商品价格历史摘要。

### 7.3 公开商城

会员首页壳增加公开商品目录：

- 启用分类筛选；
- 关键词搜索；
- 商品卡片展示图片、名称、店铺、分类、价格、库存和状态；
- 商品详情视图可用同页展开或简单详情面板实现。

## 8. 错误码

本阶段新增稳定错误码：

| 错误码 | HTTP | 含义 |
|---|---:|---|
| CATEGORY_NAME_TAKEN | 409 | 分类名已被使用 |
| PRODUCT_STATE_CONFLICT | 409 | 当前商品状态不允许此操作 |
| PRODUCT_VERSION_CONFLICT | 409 | 商品版本已变化，需要刷新后重试 |
| INVALID_IMAGE_FILE | 400 | 上传文件不是允许的图片 |
| IMAGE_TOO_LARGE | 400 | 上传图片超过大小限制 |

## 9. 测试与验收

### 9.1 自动化测试

- 共享合同：分类、商品、分页、上传响应和错误码 schema；
- 数据库迁移：表、约束、索引、全文索引、触发器和回滚顺序；
- API 集成：
  - 管理员分类 CRUD；
  - 店主商品 CRUD；
  - 跨店访问被拒绝；
  - 商品状态迁移；
  - 价格历史自动写入；
  - 公开列表过滤下架商品、停用分类和暂停店铺；
  - 中文关键词搜索；
  - 非图片和超限文件被拒绝；
- 前端单元测试：分类管理、商品管理和公开商品搜索的关键状态；
- E2E：管理员创建分类，店主发布带图片商品，会员按分类和中文关键词找到商品并查看详情。

### 9.2 验收命令

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
docker compose -f docker-compose.test.yml up -d mysql-test
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm db:test:migrate
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm test:integration
CI=true pnpm build
docker compose config
git diff --check
```

E2E 验收在本地服务可用后执行：

```bash
CI=true pnpm test:e2e
```

若 pnpm 的非交互式 wrapper 或端口复用导致 E2E 启动失败，可在确认 Docker 服务已启动后使用本地 Playwright 二进制运行：

```bash
./node_modules/.bin/playwright test
```

## 10. 索引与全文检索证据

本阶段在 `docs/evidence/database/catalog-search.md` 保存初步证据：

- 数据库版本；
- 测试数据规模；
- 分类筛选 SQL 和 `EXPLAIN ANALYZE`；
- 中文全文检索 SQL 和 `EXPLAIN ANALYZE`；
- `LIKE '%关键词%'` 对照 SQL 和 `EXPLAIN ANALYZE`；
- 执行结果摘要和限制说明。

证据只记录真实运行结果。未运行的实验必须明确标注未运行，不能填入推测数字。
