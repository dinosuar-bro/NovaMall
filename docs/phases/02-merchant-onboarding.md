# Stage 2：商户入驻闭环规格

## 1. 阶段目标

在 Stage 1 已完成认证、Session、CSRF 和三角色壳的基础上，交付开店申请的最小业务闭环：会员提交或查看自己的开店申请，管理员查看待审核申请并批准或拒绝，批准后系统在同一事务中授予该会员 OWNER 角色。会员无需重新注册，重新登录或刷新会话后即可进入店主后台。

本阶段只实现商户入驻、基础店主资料初始化和审核审计，不实现商品、分类、订单、退款、完整审计查询和店铺图片上传。

## 2. 成功标准

- 从 Stage 1 数据库继续执行迁移，新增 `merchant_applications`、`shops` 和 `audit_logs`；
- 一个会员最多只有一条开店申请记录，拒绝后通过更新同一记录重新提交；
- 所有店主后续共享平台商品池，不按店铺隔离商品经营；
- 会员可提交、查看申请，状态为 `PENDING` 或 `APPROVED` 时不能重复提交；
- 管理员可分页查看申请列表，可批准或拒绝 `PENDING` 申请；
- 拒绝必须提供原因，拒绝后会员可修改店铺名和简介再次提交；
- 批准事务同时完成申请状态更新、店主资料初始化和 OWNER 角色授予；
- 并发重复审核只有一个请求成功，另一个返回稳定冲突错误；
- 批准事务失败时不产生孤立店主资料或孤立 OWNER 角色；
- 审核状态变化通过数据库触发器写入 `audit_logs`，审计 JSON 不包含密码、密钥或手机号。

## 3. 非目标

- 店铺隔离经营、多员工、店铺转让；
- 店铺 Logo 上传；
- 店主商品管理、库存、分类和订单；
- 管理员完整用户管理和审计日志查询页面；
- 复杂工作流，例如撤销批准、管理员二次复审或申请删除；
- 邮件、短信或站内通知。

## 4. 数据库设计

### 4.1 merchant_applications

```sql
CREATE TABLE merchant_applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  shop_name VARCHAR(100) NOT NULL,
  shop_description VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL,
  reject_reason VARCHAR(500) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(3) NULL,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_merchant_applications_user (user_id),
  KEY idx_merchant_applications_status_submitted (status, submitted_at, id),
  KEY idx_merchant_applications_reviewed_by (reviewed_by),
  CONSTRAINT fk_merchant_applications_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_merchant_applications_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_merchant_applications_status
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT chk_merchant_applications_shop_name_non_empty
    CHECK (CHAR_LENGTH(TRIM(shop_name)) > 0),
  CONSTRAINT chk_merchant_applications_description_non_empty
    CHECK (CHAR_LENGTH(TRIM(shop_description)) > 0),
  CONSTRAINT chk_merchant_applications_reject_reason
    CHECK (
      (status = 'REJECTED' AND reject_reason IS NOT NULL AND CHAR_LENGTH(TRIM(reject_reason)) > 0)
      OR (status <> 'REJECTED' AND reject_reason IS NULL)
    )
);
```

`user_id` 唯一表示一个用户只有一个当前申请。拒绝后重新提交时更新原记录为 `PENDING`，清空 `reject_reason`、`reviewed_by` 和 `reviewed_at`，刷新 `submitted_at`。

### 4.2 shops

```sql
CREATE TABLE shops (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  logo_path VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_shops_owner_user (owner_user_id),
  UNIQUE KEY uq_shops_name (name),
  CONSTRAINT fk_shops_owner_user
    FOREIGN KEY (owner_user_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_shops_status CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  CONSTRAINT chk_shops_name_non_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_shops_description_non_empty CHECK (CHAR_LENGTH(TRIM(description)) > 0)
);
```

`shops.owner_user_id` 仅作为店主资料归属防线，不再代表商品经营隔离。批准申请时使用申请中的店铺名和简介初始化店主资料。

### 4.3 audit_logs

```sql
CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  request_id CHAR(36) NULL,
  table_name VARCHAR(64) NOT NULL,
  record_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(30) NOT NULL,
  old_data JSON NULL,
  new_data JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_logs_created_id (created_at, id),
  KEY idx_audit_logs_actor_created (actor_user_id, created_at),
  KEY idx_audit_logs_table_record (table_name, record_id),
  CONSTRAINT fk_audit_logs_actor
    FOREIGN KEY (actor_user_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT chk_audit_logs_action
    CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'STATUS_CHANGE'))
);
```

本阶段先由触发器记录 `merchant_applications.status` 变化；同一审计表已在商品、订单和角色变更中复用。

### 4.4 审计上下文

应用在审核事务开始后设置数据库会话变量：

```sql
SET @novamall_actor_user_id = ?;
SET @novamall_request_id = ?;
```

触发器从会话变量读取操作者和请求编号。测试直接操作数据库时变量可为空。触发器只记录脱敏业务字段：

- `status`;
- `rejectReason`;
- `reviewedBy`;
- `reviewedAt`;
- `shopName`。

不记录密码哈希、手机号密文、解密手机号、Cookie、Session 数据或密钥。

## 5. 状态机

```mermaid
stateDiagram-v2
    [*] --> PENDING: 首次提交
    PENDING --> APPROVED: 管理员批准
    PENDING --> REJECTED: 管理员拒绝
    REJECTED --> PENDING: 会员修改后重提
    APPROVED --> [*]
```

状态规则：

- `PENDING`：等待管理员审核，会员不能重复提交，只能查看；
- `REJECTED`：会员可修改店铺名和简介后重新提交；
- `APPROVED`：终态，会员不能再次提交，管理员不能再次审核；
- 审核接口必须带当前状态条件，只允许更新 `PENDING`；
- 批准后由 `shops.owner_user_id` 和 `merchant_applications.user_id` 双重唯一约束防止一人多店和重复申请。

## 6. API 合同

所有路径继承 `/api/v1`，成功和错误结构遵循 `docs/api.md`。所有写请求必须带 `X-CSRF-Token`。

### 6.1 会员申请接口

| 方法 | 路径 | 角色 | 行为 |
|---|---|---|---|
| GET | `/merchant-applications/me` | MEMBER | 查看自己的申请，无申请时返回 `application: null` |
| PUT | `/merchant-applications/me` | MEMBER + CSRF | 首次提交，或在 `REJECTED` 后更新同一记录重提 |

提交请求：

```json
{
  "shopName": "星选鲜果铺",
  "shopDescription": "主营当季水果和社区精选礼盒"
}
```

响应 DTO：

```json
{
  "id": "12",
  "shopName": "星选鲜果铺",
  "shopDescription": "主营当季水果和社区精选礼盒",
  "status": "PENDING",
  "rejectReason": null,
  "reviewedBy": null,
  "reviewedAt": null,
  "submittedAt": "2026-06-23T08:00:00.000Z",
  "updatedAt": "2026-06-23T08:00:00.000Z"
}
```

### 6.2 管理员审核接口

| 方法 | 路径 | 角色 | 行为 |
|---|---|---|---|
| GET | `/admin/merchant-applications` | ADMIN | 分页查询申请，默认按最近提交时间倒序 |
| POST | `/admin/merchant-applications/:id/approve` | ADMIN + CSRF | 批准待审核申请，创建店铺并授予 OWNER |
| POST | `/admin/merchant-applications/:id/reject` | ADMIN + CSRF | 拒绝待审核申请，必须提供原因 |

列表查询参数：

- `page`：默认 1；
- `pageSize`：默认 20，最大 100；
- `status`：可选，`PENDING`、`APPROVED`、`REJECTED`。

列表项额外返回申请人基础信息：

```json
{
  "id": "12",
  "user": {
    "id": "5",
    "username": "member01",
    "displayName": "会员一"
  },
  "shopName": "星选鲜果铺",
  "shopDescription": "主营当季水果和社区精选礼盒",
  "status": "PENDING",
  "rejectReason": null,
  "reviewedBy": null,
  "reviewedAt": null,
  "submittedAt": "2026-06-23T08:00:00.000Z",
  "updatedAt": "2026-06-23T08:00:00.000Z"
}
```

批准响应：

```json
{
  "application": {
    "id": "12",
    "status": "APPROVED"
  },
  "shop": {
    "id": "3",
    "name": "星选鲜果铺",
    "description": "主营当季水果和社区精选礼盒",
    "status": "ACTIVE"
  }
}
```

拒绝请求：

```json
{
  "reason": "店铺简介过于简单，请补充主营品类"
}
```

## 7. 共享类型与校验

`packages/shared` 新增开店申请合同：

- `merchantApplicationStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"])`；
- `merchantApplicationInputSchema`：
  - `shopName`: trim 后 2 到 100 个字符；
  - `shopDescription`: trim 后 10 到 500 个字符；
- `merchantApplicationRejectInputSchema`：
  - `reason`: trim 后 2 到 500 个字符；
- `merchantApplicationSchema`、`adminMerchantApplicationSchema`、`shopSummarySchema`；
- `paginatedResponseSchema` 如当前共享响应工具不足，则本阶段补最小通用分页合同。

新增稳定错误码：

| 错误码 | HTTP | 含义 |
|---|---:|---|
| `DUPLICATE_APPLICATION` | 409 | 已有待审核或已批准申请，不能重复提交 |
| `APPLICATION_STATE_CONFLICT` | 409 | 当前申请状态不允许审核或重提 |
| `SHOP_NAME_TAKEN` | 409 | 店铺名已被使用 |
| `RESOURCE_NOT_OWNED` | 403 | 当前申请或资源不属于当前用户 |
| `NOT_FOUND` | 404 | 申请不存在 |

`docs/api.md` 中已有的 `DUPLICATE_APPLICATION`、`RESOURCE_NOT_OWNED` 和 `NOT_FOUND` 本阶段开始落地。`APPLICATION_STATE_CONFLICT` 和 `SHOP_NAME_TAKEN` 需要同步补入 API 稳定错误码表。

## 8. 后端实现方案

新增模块 `apps/api/src/modules/merchant-applications/`：

```text
merchant-applications.routes.ts
merchant-applications.controller.ts
merchant-applications.service.ts
merchant-applications.repository.ts
```

调用方向保持 `Route → Controller → Service → Repository`：

- Route：声明路径、认证、角色和 CSRF 中间件；
- Controller：读取路径、查询和 body，调用 Service，输出统一响应；
- Service：执行业务状态机、输入校验、分页边界和错误码映射；
- Repository：唯一执行 SQL 的位置，包含事务、行锁和数据库行到 DTO 的转换。

### 8.1 会员提交

Repository 使用事务读取当前用户申请：

1. 无申请：插入 `PENDING`；
2. 当前为 `REJECTED`：更新同一记录为 `PENDING`，写入新店铺名和简介，清空拒绝字段；
3. 当前为 `PENDING` 或 `APPROVED`：返回冲突。

若店铺名与已有 `shops.name` 冲突，返回 `SHOP_NAME_TAKEN`。同名申请允许进入待审核，最终批准时再由 `shops.name` 唯一约束兜底，避免把申请阶段误做成店名预占。

### 8.2 管理员批准

批准事务步骤：

1. 设置审计上下文变量；
2. `SELECT ... FOR UPDATE` 锁定申请行；
3. 若不存在返回 `NOT_FOUND`；
4. 若状态不是 `PENDING` 返回 `APPLICATION_STATE_CONFLICT`；
5. 插入 `shops`，`owner_user_id = application.user_id`；
6. 插入 `user_roles` 的 OWNER 角色，使用 `INSERT IGNORE` 或唯一冲突幂等处理；
7. 更新申请为 `APPROVED`，写入 `reviewed_by` 和 `reviewed_at`；
8. 提交事务并返回申请和店铺摘要。

若 `shops.owner_user_id` 或 `shops.name` 唯一约束失败，事务回滚并返回稳定冲突错误。任何失败都不能留下店铺、角色或已批准申请的部分结果。

### 8.3 管理员拒绝

拒绝事务步骤：

1. 设置审计上下文变量；
2. `SELECT ... FOR UPDATE` 锁定申请行；
3. 若状态不是 `PENDING` 返回 `APPLICATION_STATE_CONFLICT`；
4. 更新为 `REJECTED`，写入拒绝原因、审核人和审核时间；
5. 提交后返回更新后的申请。

## 9. 前端信息架构

### 9.1 会员页面

在会员工作区增加开店申请区域：

- 无申请：显示开店申请表；
- `PENDING`：显示已提交状态、店铺名、简介和提交时间；
- `REJECTED`：显示拒绝原因，并允许编辑后重新提交；
- `APPROVED`：显示已通过状态和进入店主后台入口。

表单字段：

- 店铺名称；
- 店铺简介；
- 提交按钮；
- 提交前校验店铺名称和简介长度，不把明显非法输入发给后端；
- 用户界面只展示可理解的业务提示，不直接展示后端原始错误、技术错误码或 requestId。

角色侧边栏只显示当前角色相关入口。会员不显示店主和管理员入口；店主不显示管理员入口；管理员不显示会员/店主业务入口。多角色切换后续再做账号菜单，不在本阶段用固定三角色菜单替代权限边界。

角色工作区必须先确认当前会话再渲染业务区块。未登录访问 `/member/*`、`/owner/*`、`/admin/*` 或 `/profile` 时直接进入登录页，不触发开店申请、商品管理或审核列表接口，也不把认证错误展示在业务面板里。已登录用户访问根路径 `/` 时按角色优先级进入对应默认子路由：`ADMIN -> /admin/categories`、`OWNER -> /owner/products`、`MEMBER -> /member/catalog`。

开店申请表单统一按桌面端工作区设计，表单输入区、主按钮和状态提示在阶段面板内保持同宽对齐，不再针对移动端做额外优化。

### 9.2 管理员页面

在管理员工作区增加开店审核区域：

- 状态筛选；
- 申请列表；
- 待审核申请的批准和拒绝操作；
- 拒绝原因输入；
- 成功后刷新列表或更新当前行状态。

本阶段保持单页简化实现，不引入复杂表格库。

### 9.3 店主页面

批准后店主后台从“阶段 1 空壳”升级为店主资料摘要：

- 店铺名称；
- 店铺简介；
- 店铺状态；
- 后续商品功能的空状态。

新增 `GET /owner/shop` 用于读取当前店主资料。若用户拥有 OWNER 角色但没有店主资料，返回 `NOT_FOUND`，用于暴露不一致数据。

## 10. 测试策略

### 10.1 共享合同测试

- 合法开店申请输入通过；
- 空店铺名、过短简介、过长字段被拒绝；
- 状态枚举只接受 `PENDING`、`APPROVED`、`REJECTED`；
- 稳定错误码包含阶段 2 新增错误。

### 10.2 API 与数据库集成测试

使用真实 MySQL 测试库，先运行迁移。

必须覆盖：

1. 会员首次提交申请后可读取自己的申请；
2. `PENDING` 申请重复提交返回 `DUPLICATE_APPLICATION`；
3. 管理员拒绝后，会员可更新同一记录重新提交；
4. 管理员批准后创建店铺并授予 OWNER 角色；
5. 批准后 `/api/v1/auth/session` 返回角色包含 `OWNER`；
6. MEMBER 不能调用管理员审核接口；
7. 非 ADMIN 不能批准或拒绝；
8. 重复批准同一申请只有第一次成功，第二次返回 `APPLICATION_STATE_CONFLICT`；
9. 并发批准同一申请只有一个成功；
10. 店名唯一冲突导致批准失败且不产生孤立 OWNER 角色；
11. 审核状态变化产生 `audit_logs` 记录；
12. 审计 JSON 不包含密码、手机号或 Session 数据。

### 10.3 前端测试

- 会员无申请时显示表单；
- 会员表单在店铺名过短或简介过短时不发起提交请求；
- 待审核状态不显示重复提交按钮；
- 拒绝后展示原因并允许重新提交；
- 管理员列表显示申请人、店铺名和状态；
- 批准/拒绝按钮提交期间禁用；
- 侧边栏按当前角色显示对应入口；
- 已登录用户访问根路径时进入对应角色工作区；
- 未登录用户访问角色工作区时回到登录页，且不触发业务接口；
- API 错误显示稳定中文提示，不直接暴露 requestId。

### 10.4 E2E

在浏览器中覆盖最小链路：

1. 新会员注册并提交开店申请；
2. 管理员登录并批准申请；
3. 会员重新进入会话后可进入店主后台；
4. 店主后台进入商品管理页，侧边栏不再展示“店铺资料”入口。

## 11. 阶段验收命令

实施后至少执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
env -u CI ./node_modules/.bin/playwright test
pnpm build
docker compose config
git diff --check
```

数据库集成测试前需要启动测试 MySQL 并执行迁移：

```bash
docker compose -f docker-compose.test.yml up -d mysql-test
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' pnpm db:test:migrate
```

若 Docker 服务不可用，必须明确报告未运行的数据库专项测试，不能声称阶段完成。

## 12. 完成定义

- 本文范围全部实现，非目标未提前开发；
- `docs/api.md`、数据库文档和实现保持一致；
- 新增迁移可从 Stage 1 空库顺序执行；
- 所有新增行为先有失败测试，再有最小实现；
- 类型检查、Lint、单元测试、集成测试、E2E 和构建通过；
- 并发审核和事务回滚场景有真实数据库测试；
- 审计日志真实由触发器生成，并验证脱敏边界；
- 没有 Secret、真实手机号、数据卷、构建产物或临时文件进入 Git。
