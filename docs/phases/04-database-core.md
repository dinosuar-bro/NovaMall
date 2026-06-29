# Stage 4：数据库技术核心落地闭环规格

## 1. 阶段目标

在 Stage 3 商品目录已完成的基础上，交付支撑课程验收的数据库核心闭环。本阶段优先保证 9 项高阶数据库技术全部真实落地：存储过程、触发器、视图、索引优化、事务与并发控制、窗口函数、审计日志、全文检索和 AES 数据加密。

业务范围只保留数据库技术需要的最小订单链路：会员地址、购物车、统一结算、模拟支付、取消、订单快照、有效销量和审计查询。不实现完整电商订单中心、复杂售后、真实支付、物流、优惠、评价或运营报表。

## 2. 成功标准

- 从 Stage 3 数据库继续执行迁移，新增最小订单域表和只读视图；
- `sp_checkout_cart` 存储过程具备输入参数、输出参数、事务、库存行锁、统一结算、订单快照、购物车清理和 checkoutToken 幂等；
- 库存不足、商品不可售、地址越权和空购物车时，结算事务完整回滚；
- 模拟支付、取消待支付订单和库存恢复使用短事务完成；
- 总订单、子订单、角色授予和商品变更写入脱敏审计日志；
- 会员订单明细和有效销量通过视图提供；
- Top 10 使用窗口函数并有稳定并列排序；
- 分类商品、共享商品、会员订单、履约订单、审计日志和全文检索索引均有测试或证据；
- AES 手机号加密继续使用每条记录独立 IV，并补齐订单快照密文验证；
- `docs/evidence/database/` 下按“序号-技术名.md”保存 9 项数据库技术的真实执行证据。

## 3. 非目标

- 完整订单中心、复杂订单筛选和多步骤订单详情页；
- 真实支付网关、支付回调、对账和退款入账；
- 完整退款页面、售后原因、凭证上传和客服介入；
- 物流公司、物流单号、物流轨迹和收货地址智能识别；
- 优惠券、积分、促销、评价、收藏、推荐和客服；
- 分区表、备份恢复、数据库用户权限演示；
- 通过前端执行任意 SQL 或展示可修改数据库的实验控制台。

## 4. 数据库设计

### 4.1 addresses

```sql
CREATE TABLE addresses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  receiver_name VARCHAR(80) NOT NULL,
  receiver_phone_cipher VARBINARY(255) NOT NULL,
  receiver_phone_iv BINARY(16) NOT NULL,
  province VARCHAR(60) NOT NULL,
  city VARCHAR(60) NOT NULL,
  district VARCHAR(60) NOT NULL,
  detail VARCHAR(255) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_addresses_user_default (user_id, is_default, id),
  CONSTRAINT fk_addresses_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_addresses_receiver_name_non_empty CHECK (CHAR_LENGTH(TRIM(receiver_name)) > 0),
  CONSTRAINT chk_addresses_detail_non_empty CHECK (CHAR_LENGTH(TRIM(detail)) > 0)
);
```

地址手机号使用与用户手机号相同的 AES-CBC 加密策略。订单快照复制地址字段、手机号密文和 IV，不保存手机号明文。

### 4.2 cart_items

```sql
CREATE TABLE cart_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cart_items_user_product (user_id, product_id),
  KEY idx_cart_items_product (product_id),
  CONSTRAINT fk_cart_items_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_cart_items_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_cart_items_quantity_positive CHECK (quantity > 0)
);
```

购物车只提供最小增删改查。商品下架、店铺暂停或库存变化不自动删除购物车项，结算时统一校验。

### 4.3 master_orders

```sql
CREATE TABLE master_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(40) NOT NULL,
  buyer_user_id BIGINT UNSIGNED NOT NULL,
  address_id BIGINT UNSIGNED NOT NULL,
  checkout_token CHAR(36) NOT NULL,
  total_amount DECIMAL(12, 2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT',
  receiver_name VARCHAR(80) NOT NULL,
  receiver_phone_cipher VARBINARY(255) NOT NULL,
  receiver_phone_iv BINARY(16) NOT NULL,
  address_snapshot JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  paid_at DATETIME(3) NULL,
  canceled_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_master_orders_order_no (order_no),
  UNIQUE KEY uq_master_orders_buyer_checkout (buyer_user_id, checkout_token),
  KEY idx_master_orders_buyer_created (buyer_user_id, created_at, id),
  CONSTRAINT fk_master_orders_buyer
    FOREIGN KEY (buyer_user_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_master_orders_address
    FOREIGN KEY (address_id) REFERENCES addresses (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_master_orders_status CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'CANCELED', 'COMPLETED')),
  CONSTRAINT chk_master_orders_total_non_negative CHECK (total_amount >= 0)
);
```

`buyer_user_id + checkout_token` 是结算幂等约束。重复调用存储过程时返回原订单号，不重复扣库存。

### 4.4 shop_orders

```sql
CREATE TABLE shop_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  master_order_id BIGINT UNSIGNED NOT NULL,
  shop_id BIGINT UNSIGNED NOT NULL,
  shop_order_no VARCHAR(48) NOT NULL,
  subtotal_amount DECIMAL(12, 2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  paid_at DATETIME(3) NULL,
  shipped_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  canceled_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_shop_orders_order_no (shop_order_no),
  KEY idx_shop_orders_master (master_order_id),
  KEY idx_shop_orders_shop_status_updated (shop_id, status, updated_at, id),
  CONSTRAINT fk_shop_orders_master
    FOREIGN KEY (master_order_id) REFERENCES master_orders (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_shop_orders_shop
    FOREIGN KEY (shop_id) REFERENCES shops (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_shop_orders_status CHECK (status IN ('PENDING_PAYMENT', 'PENDING_SHIPMENT', 'SHIPPED', 'COMPLETED', 'CANCELED', 'REFUNDED')),
  CONSTRAINT chk_shop_orders_subtotal_non_negative CHECK (subtotal_amount >= 0)
);
```

阶段 4 只要求待支付、已支付待发货和取消状态可由 API 驱动；发货、确认收货在 Stage 5 最小演示中补齐。

### 4.5 order_items

```sql
CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  product_main_image_path VARCHAR(255) NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  line_amount DECIMAL(12, 2) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_order_items_shop_order (shop_order_id),
  KEY idx_order_items_product_shop_order (product_id, shop_order_id),
  CONSTRAINT fk_order_items_shop_order
    FOREIGN KEY (shop_order_id) REFERENCES shop_orders (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT chk_order_items_unit_price_positive CHECK (unit_price > 0),
  CONSTRAINT chk_order_items_line_amount_positive CHECK (line_amount > 0)
);
```

订单明细保存商品名、主图和下单单价快照。后续商品修改不影响历史订单。

### 4.6 payments

```sql
CREATE TABLE payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  master_order_id BIGINT UNSIGNED NOT NULL,
  payment_no VARCHAR(48) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  paid_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_order (master_order_id),
  UNIQUE KEY uq_payments_payment_no (payment_no),
  CONSTRAINT fk_payments_master_order
    FOREIGN KEY (master_order_id) REFERENCES master_orders (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_payments_status CHECK (status IN ('PENDING', 'PAID', 'CANCELED')),
  CONSTRAINT chk_payments_amount_non_negative CHECK (amount >= 0)
);
```

支付为课程演示用模拟支付。重复支付同一总订单必须幂等，不重复记账。

## 5. 存储过程设计

### 5.1 sp_checkout_cart

接口：

```sql
CALL sp_checkout_cart(
  IN  p_user_id BIGINT UNSIGNED,
  IN  p_address_id BIGINT UNSIGNED,
  IN  p_checkout_token CHAR(36),
  OUT p_order_no VARCHAR(40)
);
```

算法：

1. 若 `master_orders` 已存在同一 `buyer_user_id + checkout_token`，直接返回原 `order_no`。
2. 开启事务，校验地址属于当前会员。
3. 校验购物车非空。
4. 按 `product_id` 升序锁定购物车商品和商品行，使用 `SELECT ... FOR UPDATE`。
5. 校验商品 `PUBLISHED`、分类 `ACTIVE`、数量大于 0、库存充足。
6. 使用数据库当前 `products.price` 计算金额，不信任客户端金额。
7. 创建总订单和履约子订单，创建订单明细快照。
8. 扣减库存并增加商品版本号。
9. 创建待支付 payment，清空购物车。
10. 提交事务，通过 OUT 参数返回订单号。
11. `EXIT HANDLER FOR SQLEXCEPTION` 回滚并重新抛出异常。

业务错误使用 `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = ...`：

| 错误标识 | 含义 | API 映射 |
|---|---|---|
| `EMPTY_CART` | 购物车为空 | `EMPTY_CART` |
| `ADDRESS_NOT_OWNED` | 地址不属于当前会员 | `ADDRESS_NOT_OWNED` |
| `PRODUCT_UNAVAILABLE` | 商品或分类不可售 | `PRODUCT_UNAVAILABLE` |
| `OUT_OF_STOCK` | 库存不足 | `OUT_OF_STOCK` |

## 6. 触发器和审计

保留 Stage 2 与 Stage 3 已有触发器，新增：

- `trg_master_orders_audit`：总订单状态变化写入 `audit_logs`；
- `trg_shop_orders_audit`：子订单状态变化写入 `audit_logs`；
- `trg_user_roles_audit`：角色授予写入 `audit_logs`。

触发器读取连接级变量：

```sql
SET @novamall_actor_user_id = ?;
SET @novamall_request_id = ?;
```

应用层必须在同一连接内设置变量，并在连接释放前清空。审计 JSON 不包含密码哈希、手机号明文、Cookie、密钥或完整地址明文。

## 7. 视图

### 7.1 v_member_order_details

封装总订单、子订单和订单明细，字段包括会员 ID、总订单号、子订单号、店铺、商品快照、数量、金额和状态。API 查询仍必须按当前会员过滤。

### 7.2 v_effective_product_sales

按商品聚合有效销量和销售额，只统计 `PENDING_SHIPMENT`、`SHIPPED`、`COMPLETED`，排除 `PENDING_PAYMENT`、`CANCELED` 和 `REFUNDED`。

### 7.3 v_shop_sales_summary

按日期聚合有效订单数、商品数量和销售额，供 Stage 5 最小店主概览使用。

视图不包含手机号解密表达式。

## 8. API 合同

所有路径继承 `/api/v1`，写请求必须携带 `X-CSRF-Token`。

### 8.1 地址和购物车

| 方法 | 路径 | 角色 | 行为 |
|---|---|---|---|
| GET | `/member/addresses` | MEMBER | 当前会员地址列表 |
| POST | `/member/addresses` | MEMBER + CSRF | 新增地址 |
| GET | `/member/cart` | MEMBER | 当前购物车 |
| POST | `/member/cart/items` | MEMBER + CSRF | 添加或累加商品 |
| PATCH | `/member/cart/items/:itemId` | MEMBER + CSRF | 修改数量 |
| DELETE | `/member/cart/items/:itemId` | MEMBER + CSRF | 删除购物车项 |

### 8.2 结算和订单

| 方法 | 路径 | 角色 | 行为 |
|---|---|---|---|
| POST | `/member/checkout` | MEMBER + CSRF | 调用 `sp_checkout_cart` 并返回订单号 |
| GET | `/member/orders` | MEMBER | 当前会员订单列表 |
| POST | `/member/orders/:orderNo/pay` | MEMBER + CSRF | 模拟支付 |
| POST | `/member/orders/:orderNo/cancel` | MEMBER + CSRF | 取消待支付订单并恢复库存 |

### 8.3 店主和管理员只读查询

| 方法 | 路径 | 角色 | 行为 |
|---|---|---|---|
| GET | `/owner/shop-orders` | OWNER | 共享履约子订单列表 |
| GET | `/admin/audit-logs` | ADMIN | 审计日志只读分页 |
| GET | `/admin/database/top-products` | ADMIN | 窗口函数 Top 10 |

## 9. 错误码

本阶段新增稳定错误码：

| 错误码 | HTTP | 含义 |
|---|---:|---|
| EMPTY_CART | 409 | 购物车为空 |
| ADDRESS_NOT_OWNED | 403 | 地址不属于当前会员 |
| PRODUCT_UNAVAILABLE | 409 | 商品或分类不可售 |
| OUT_OF_STOCK | 409 | 库存不足 |
| ORDER_STATE_CONFLICT | 409 | 当前订单状态不允许操作 |
| CHECKOUT_TOKEN_CONFLICT | 409 | checkoutToken 格式或归属冲突 |

## 10. 测试与验收

### 10.1 自动化测试

- 共享合同：地址、购物车、结算、订单、审计、Top 10 DTO 和错误码；
- 数据库迁移：新增表、外键、唯一约束、检查约束、索引、触发器、视图和存储过程；
- 存储过程集成：
  - 成功统一结算返回 OUT 订单号；
  - 库存不足完整回滚；
  - 相同 checkoutToken 重试不重复下单；
  - 两连接争抢最后库存只有一个成功；
- API 集成：
  - 地址和购物车归属校验；
  - 结算、支付和取消；
  - 跨会员订单操作被拒绝；
  - 店主可查看共享履约子订单；
  - 管理员只读审计和 Top 10；
- 数据库证据：
  - 视图与基础表结果一致；
  - 索引和全文检索保存 `EXPLAIN ANALYZE`；
  - AES 不同 IV 密文不同，错误密钥不能得到有效手机号；
  - 审计日志无敏感字段。

### 10.2 验收命令

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
docker compose -f docker-compose.test.yml up -d mysql-test
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm db:test:migrate
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm test:integration
CI=true pnpm build
git diff --check
```

阶段 4 不要求完整 E2E 主线通过，但不能破坏 Stage 3 已有 E2E。若本阶段改动影响浏览器演示入口，需要补充最小 Playwright 验证。

## 11. 证据文件

本阶段只新增一份精简证据文件：

```text
docs/evidence/database/
├── 01-存储过程.md
├── 02-触发器.md
├── 03-视图.md
├── 04-索引优化.md
├── 05-事务与并发控制.md
├── 06-窗口函数.md
├── 07-审计日志.md
├── 08-全文检索.md
└── 09-AES数据加密.md
```

该目录用 9 个文件分别覆盖存储过程、触发器、视图、索引优化、事务并发、窗口函数、审计日志、全文检索和 AES 加密。性能数字和执行计划必须来自真实命令，不能预填。
