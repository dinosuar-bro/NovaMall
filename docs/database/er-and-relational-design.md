# 数据库 ER 图与关系模式

## 1. 设计目标

数据库负责保存平台业务事实、维护关系完整性、支撑统一结算事务，并为 9 项高阶数据库技术提供真实业务落点。所有业务表使用 InnoDB 和 `utf8mb4`。

## 2. 概念 ER 图

![NovaMall Chen ER 图](diagrams/novamall-chen-er.svg)

图例：

- 矩形表示实体；
- 菱形表示实体之间的联系；
- 椭圆表示属性；
- 带下划线的属性表示主键；
- 联系边上的 `1`、`N`、`0..1` 表示基数约束。

购物车项和用户角色在概念模型中分别表示为“加入购物车”和“拥有角色”两个多对多联系，联系自身保存购物数量/加入时间或授权时间；映射到关系模型时分别形成 `cart_items` 和 `user_roles` 表。

为保证图在课程报告中清晰可读，概念图只展示主键和核心业务属性。完整物理字段、外键、状态与数据类型见本文第 3、4 节。SVG 源图可以无损缩放，Graphviz 源文件位于 [`diagrams/novamall-chen-er.dot`](diagrams/novamall-chen-er.dot)。

`sessions` 是认证基础设施表，按会话存储适配器约定保存，不参与业务概念 ER 图。

## 3. 关系模式总览

下列 `PK` 表示主键，`FK` 表示外键，`UQ` 表示唯一约束。

```text
USERS(id PK, username UQ, password_hash, display_name, phone_cipher,
      phone_iv, status, created_at, updated_at)

ROLES(id PK, code UQ, name UQ)

USER_ROLES(user_id PK/FK, role_id PK/FK, granted_at, granted_by FK)

ADDRESSES(id PK, user_id FK, recipient_name, province, city, district,
          detail, is_default, created_at, updated_at)

MERCHANT_APPLICATIONS(id PK, user_id UQ/FK, shop_name, shop_description,
                      status, reject_reason, reviewed_by FK, reviewed_at,
                      submitted_at, updated_at)

SHOPS(id PK, owner_user_id UQ/FK, name UQ, description, logo_path,
      status, created_at, updated_at)

CATEGORIES(id PK, name UQ, description, sort_order, status,
           created_at, updated_at)

PRODUCTS(id PK, shop_id FK, category_id FK, name, price, stock,
         description, image_path, status, created_at, updated_at)

CART_ITEMS(id PK, user_id FK, product_id FK, quantity,
           created_at, updated_at, UQ(user_id, product_id))

MASTER_ORDERS(id PK, order_no UQ, checkout_token UQ, buyer_user_id FK, source_address_id FK,
              recipient_name, recipient_phone_cipher, recipient_phone_iv,
              province, city, district, address_detail, total_amount, status,
              created_at, paid_at, cancelled_at, completed_at, updated_at)

SHOP_ORDERS(id PK, shop_order_no UQ, master_order_id FK, shop_id FK,
            subtotal_amount, status, shipped_at, completed_at, cancelled_at,
            updated_at)

ORDER_ITEMS(id PK, shop_order_id FK, product_id FK, product_name,
            product_image_path, unit_price, quantity, line_amount)

PAYMENTS(id PK, payment_no UQ, master_order_id UQ/FK, amount, method,
         status, paid_at, created_at, updated_at)

REFUND_REQUESTS(id PK, refund_no UQ, shop_order_id UQ/FK,
                applicant_user_id FK, amount, reason, status,
                reviewed_by FK, reviewed_at, reject_reason,
                created_at, updated_at)

PRODUCT_PRICE_HISTORY(id PK, product_id FK, old_price, new_price,
                      changed_by FK, changed_at)

AUDIT_LOGS(id PK, actor_user_id FK, request_id, table_name, record_id,
           action, old_data, new_data, created_at)

SESSIONS(session_id PK, expires, data)
```

## 4. 数据字典

### 4.1 users

| 字段          | 类型            | 空值 | 约束与说明           |
| ------------- | --------------- | ---: | -------------------- |
| id            | BIGINT UNSIGNED |   否 | PK，自增             |
| username      | VARCHAR(50)     |   否 | UQ，登录名           |
| password_hash | VARCHAR(255)    |   否 | 不可逆密码哈希       |
| display_name  | VARCHAR(100)    |   否 | 会员姓名/展示名      |
| phone_cipher  | VARBINARY(255)  |   否 | AES 密文             |
| phone_iv      | BINARY(16)      |   否 | 每条手机号独立 IV    |
| status        | VARCHAR(20)     |   否 | `ACTIVE`、`DISABLED` |
| created_at    | DATETIME(3)     |   否 | 创建时间             |
| updated_at    | DATETIME(3)     |   否 | 更新时间             |

### 4.2 roles

| 字段 | 类型             | 空值 | 约束与说明                     |
| ---- | ---------------- | ---: | ------------------------------ |
| id   | TINYINT UNSIGNED |   否 | PK                             |
| code | VARCHAR(20)      |   否 | UQ：`MEMBER`、`OWNER`、`ADMIN` |
| name | VARCHAR(50)      |   否 | UQ，角色中文名                 |

角色是固定种子数据，不提供删除接口。

### 4.3 user_roles

| 字段       | 类型             | 空值 | 约束与说明                          |
| ---------- | ---------------- | ---: | ----------------------------------- |
| user_id    | BIGINT UNSIGNED  |   否 | PK/FK → users.id                    |
| role_id    | TINYINT UNSIGNED |   否 | PK/FK → roles.id                    |
| granted_at | DATETIME(3)      |   否 | 授权时间                            |
| granted_by | BIGINT UNSIGNED  |   是 | FK → users.id；注册时会员角色可为空 |

### 4.4 addresses

| 字段                    | 类型            | 空值 | 约束与说明    |
| ----------------------- | --------------- | ---: | ------------- |
| id                      | BIGINT UNSIGNED |   否 | PK，自增      |
| user_id                 | BIGINT UNSIGNED |   否 | FK → users.id |
| recipient_name          | VARCHAR(100)    |   否 | 收件人        |
| province                | VARCHAR(50)     |   否 | 省            |
| city                    | VARCHAR(50)     |   否 | 市            |
| district                | VARCHAR(50)     |   否 | 区/县         |
| detail                  | VARCHAR(255)    |   否 | 详细地址      |
| is_default              | BOOLEAN         |   否 | 默认地址标志  |
| created_at / updated_at | DATETIME(3)     |   否 | 审计时间      |

同一用户最多一个默认地址，由事务化 Service 维护。

### 4.5 merchant_applications

| 字段             | 类型            | 空值 | 约束与说明                        |
| ---------------- | --------------- | ---: | --------------------------------- |
| id               | BIGINT UNSIGNED |   否 | PK，自增                          |
| user_id          | BIGINT UNSIGNED |   否 | UQ/FK → users.id                  |
| shop_name        | VARCHAR(100)    |   否 | 拟申请店铺名                      |
| shop_description | VARCHAR(500)    |   否 | 店铺简介                          |
| status           | VARCHAR(20)     |   否 | `PENDING`、`APPROVED`、`REJECTED` |
| reject_reason    | VARCHAR(500)    |   是 | 拒绝时必填                        |
| reviewed_by      | BIGINT UNSIGNED |   是 | FK → users.id，管理员             |
| reviewed_at      | DATETIME(3)     |   是 | 审核时间                          |
| submitted_at     | DATETIME(3)     |   否 | 最近提交时间                      |
| updated_at       | DATETIME(3)     |   否 | 更新时间                          |

拒绝后会员修改同一记录并重新提交，避免保存多个相互冲突的当前申请。

### 4.6 shops

| 字段                    | 类型            | 空值 | 约束与说明                 |
| ----------------------- | --------------- | ---: | -------------------------- |
| id                      | BIGINT UNSIGNED |   否 | PK，自增                   |
| owner_user_id           | BIGINT UNSIGNED |   否 | UQ/FK → users.id，店主资料归属 |
| name                    | VARCHAR(100)    |   否 | UQ，店铺名                 |
| description             | VARCHAR(500)    |   否 | 店铺简介                   |
| logo_path               | VARCHAR(255)    |   是 | 本地图片相对路径           |
| status                  | VARCHAR(20)     |   否 | `ACTIVE`、`SUSPENDED`      |
| created_at / updated_at | DATETIME(3)     |   否 | 审计时间                   |

### 4.7 categories

| 字段                    | 类型            | 空值 | 约束与说明           |
| ----------------------- | --------------- | ---: | -------------------- |
| id                      | BIGINT UNSIGNED |   否 | PK，自增             |
| name                    | VARCHAR(100)    |   否 | UQ                   |
| description             | VARCHAR(500)    |   是 | 分类说明             |
| sort_order              | INT UNSIGNED    |   否 | 展示顺序，默认 0     |
| status                  | VARCHAR(20)     |   否 | `ACTIVE`、`DISABLED` |
| created_at / updated_at | DATETIME(3)     |   否 | 审计时间             |

课程范围只做一级分类。

### 4.8 products

| 字段                    | 类型            | 空值 | 约束与说明                                 |
| ----------------------- | --------------- | ---: | ------------------------------------------ |
| id                      | BIGINT UNSIGNED |   否 | PK，自增                                   |
| shop_id                 | BIGINT UNSIGNED |   否 | FK → shops.id                              |
| category_id             | BIGINT UNSIGNED |   否 | FK → categories.id                         |
| name                    | VARCHAR(200)    |   否 | 商品名称                                   |
| price                   | DECIMAL(12,2)   |   否 | `price >= 0`                               |
| stock                   | INT UNSIGNED    |   否 | 当前可售库存                               |
| description             | TEXT            |   否 | 商品简介                                   |
| image_path              | VARCHAR(255)    |   否 | 本地图片相对路径                           |
| status                  | VARCHAR(20)     |   否 | `DRAFT`、`ON_SALE`、`OFF_SALE`、`ARCHIVED` |
| created_at / updated_at | DATETIME(3)     |   否 | 审计时间                                   |

`name, description` 建立带 ngram 解析器的 FULLTEXT 索引，用于中文搜索。

### 4.9 cart_items

| 字段                    | 类型            | 空值 | 约束与说明       |
| ----------------------- | --------------- | ---: | ---------------- |
| id                      | BIGINT UNSIGNED |   否 | PK，自增         |
| user_id                 | BIGINT UNSIGNED |   否 | FK → users.id    |
| product_id              | BIGINT UNSIGNED |   否 | FK → products.id |
| quantity                | INT UNSIGNED    |   否 | `quantity > 0`   |
| created_at / updated_at | DATETIME(3)     |   否 | 审计时间         |

唯一约束 `(user_id, product_id)` 保证同一商品只出现一次。

### 4.10 master_orders

| 字段                                  | 类型            | 空值 | 约束与说明                             |
| ------------------------------------- | --------------- | ---: | -------------------------------------- |
| id                                    | BIGINT UNSIGNED |   否 | PK，自增                               |
| order_no                              | CHAR(36)        |   否 | UQ，UUID                               |
| checkout_token                        | CHAR(36)        |   否 | UQ，结算幂等令牌                       |
| buyer_user_id                         | BIGINT UNSIGNED |   否 | FK → users.id                          |
| source_address_id                     | BIGINT UNSIGNED |   是 | FK → addresses.id，地址删除时 SET NULL |
| recipient_name                        | VARCHAR(100)    |   否 | 下单快照                               |
| recipient_phone_cipher                | VARBINARY(255)  |   否 | 下单时手机号密文快照                   |
| recipient_phone_iv                    | BINARY(16)      |   否 | 密文 IV 快照                           |
| province / city / district            | VARCHAR(50)     |   否 | 地址快照                               |
| address_detail                        | VARCHAR(255)    |   否 | 详细地址快照                           |
| total_amount                          | DECIMAL(14,2)   |   否 | 总成交金额，`>= 0`                     |
| status                                | VARCHAR(30)     |   否 | 见订单状态机                           |
| created_at / updated_at               | DATETIME(3)     |   否 | 审计时间                               |
| paid_at / cancelled_at / completed_at | DATETIME(3)     |   是 | 状态时间                               |

总订单状态：`PENDING_PAYMENT`、`PAID`、`FULFILLING`、`COMPLETED`、`CANCELLED`、`PARTIALLY_REFUNDED`、`REFUNDED`。

### 4.11 shop_orders

| 字段                                     | 类型            | 空值 | 约束与说明             |
| ---------------------------------------- | --------------- | ---: | ---------------------- |
| id                                       | BIGINT UNSIGNED |   否 | PK，自增               |
| shop_order_no                            | CHAR(36)        |   否 | UQ，UUID               |
| master_order_id                          | BIGINT UNSIGNED |   否 | FK → master_orders.id  |
| shop_id                                  | BIGINT UNSIGNED |   否 | FK → shops.id          |
| subtotal_amount                          | DECIMAL(14,2)   |   否 | 子订单成交金额，`>= 0` |
| status                                   | VARCHAR(30)     |   否 | 子订单状态             |
| shipped_at / completed_at / cancelled_at | DATETIME(3)     |   是 | 状态时间               |
| updated_at                               | DATETIME(3)     |   否 | 更新时间               |

子订单状态：`PENDING_PAYMENT`、`PENDING_SHIPMENT`、`SHIPPED`、`COMPLETED`、`REFUND_PENDING`、`REFUNDED`、`CANCELLED`。

### 4.12 order_items

| 字段               | 类型            | 空值 | 约束与说明              |
| ------------------ | --------------- | ---: | ----------------------- |
| id                 | BIGINT UNSIGNED |   否 | PK，自增                |
| shop_order_id      | BIGINT UNSIGNED |   否 | FK → shop_orders.id     |
| product_id         | BIGINT UNSIGNED |   否 | FK → products.id        |
| product_name       | VARCHAR(200)    |   否 | 商品名称快照            |
| product_image_path | VARCHAR(255)    |   否 | 图片路径快照            |
| unit_price         | DECIMAL(12,2)   |   否 | 成交单价，`>= 0`        |
| quantity           | INT UNSIGNED    |   否 | `quantity > 0`          |
| line_amount        | DECIMAL(14,2)   |   否 | `unit_price * quantity` |

### 4.13 payments

| 字段                    | 类型            | 空值 | 约束与说明                     |
| ----------------------- | --------------- | ---: | ------------------------------ |
| id                      | BIGINT UNSIGNED |   否 | PK，自增                       |
| payment_no              | CHAR(36)        |   否 | UQ，UUID                       |
| master_order_id         | BIGINT UNSIGNED |   否 | UQ/FK → master_orders.id       |
| amount                  | DECIMAL(14,2)   |   否 | 必须等于总订单金额             |
| method                  | VARCHAR(20)     |   否 | 固定 `MOCK`                    |
| status                  | VARCHAR(20)     |   否 | `PENDING`、`SUCCESS`、`FAILED` |
| paid_at                 | DATETIME(3)     |   是 | 成功时间                       |
| created_at / updated_at | DATETIME(3)     |   否 | 审计时间                       |

### 4.14 refund_requests

| 字段                    | 类型            | 空值 | 约束与说明                        |
| ----------------------- | --------------- | ---: | --------------------------------- |
| id                      | BIGINT UNSIGNED |   否 | PK，自增                          |
| refund_no               | CHAR(36)        |   否 | UQ，UUID                          |
| shop_order_id           | BIGINT UNSIGNED |   否 | UQ/FK → shop_orders.id            |
| applicant_user_id       | BIGINT UNSIGNED |   否 | FK → users.id                     |
| amount                  | DECIMAL(14,2)   |   否 | 等于子订单金额                    |
| reason                  | VARCHAR(500)    |   否 | 退款原因                          |
| status                  | VARCHAR(20)     |   否 | `PENDING`、`APPROVED`、`REJECTED` |
| reviewed_by             | BIGINT UNSIGNED |   是 | FK → users.id，店主               |
| reviewed_at             | DATETIME(3)     |   是 | 审核时间                          |
| reject_reason           | VARCHAR(500)    |   是 | 拒绝时必填                        |
| created_at / updated_at | DATETIME(3)     |   否 | 审计时间                          |

### 4.15 product_price_history

| 字段                  | 类型            | 空值 | 约束与说明                    |
| --------------------- | --------------- | ---: | ----------------------------- |
| id                    | BIGINT UNSIGNED |   否 | PK，自增                      |
| product_id            | BIGINT UNSIGNED |   否 | FK → products.id              |
| old_price / new_price | DECIMAL(12,2)   |   否 | 变更前后价格                  |
| changed_by            | BIGINT UNSIGNED |   是 | FK → users.id，来自连接上下文 |
| changed_at            | DATETIME(3)     |   否 | 变更时间                      |

### 4.16 audit_logs

| 字段          | 类型            | 空值 | 约束与说明                                    |
| ------------- | --------------- | ---: | --------------------------------------------- |
| id            | BIGINT UNSIGNED |   否 | PK，自增                                      |
| actor_user_id | BIGINT UNSIGNED |   是 | FK → users.id，系统动作可为空                 |
| request_id    | CHAR(36)        |   是 | API 请求编号                                  |
| table_name    | VARCHAR(64)     |   否 | 被审计表                                      |
| record_id     | BIGINT UNSIGNED |   否 | 被审计记录主键                                |
| action        | VARCHAR(30)     |   否 | `INSERT`、`UPDATE`、`DELETE`、`STATUS_CHANGE` |
| old_data      | JSON            |   是 | 脱敏旧值                                      |
| new_data      | JSON            |   是 | 脱敏新值                                      |
| created_at    | DATETIME(3)     |   否 | 发生时间                                      |

审计 JSON 禁止包含密码哈希、加密密钥和解密手机号。

### 4.17 sessions

| 字段       | 类型            | 空值 | 约束与说明                      |
| ---------- | --------------- | ---: | ------------------------------- |
| session_id | VARCHAR(128)    |   否 | PK                              |
| expires    | BIGINT UNSIGNED |   否 | 到期时间，由 Session Store 约定 |
| data       | MEDIUMTEXT      |   否 | Session 序列化数据              |

## 5. 删除与归档策略

- 用户、店铺、分类、商品和订单不提供物理删除业务接口，以状态禁用或归档。
- 购物车项和 Session 可物理删除。
- 收货地址可删除；订单保存完整地址快照，`source_address_id` 置空不影响历史。
- 审计日志和价格历史只追加，不由普通业务接口修改或删除。

## 6. 金额与时间约定

- 金额使用 `DECIMAL`，应用层使用十进制字符串或明确金额类型，禁止 JavaScript 浮点直接累计。
- 数据库存储 UTC 时间，API 使用 ISO 8601，前端按用户时区展示。
- 所有业务编号使用 UUID 字符串；内部关联使用 BIGINT 主键。
