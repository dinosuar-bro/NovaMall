# NovaMall API 设计

## 1. 通用约定

- 基础路径：`/api/v1`
- 数据格式：JSON；图片上传使用 `multipart/form-data`
- 登录状态：HttpOnly Session Cookie
- 时间：ISO 8601 UTC 字符串
- 金额：JSON 中使用两位小数字符串，例如 `"199.00"`
- ID：JSON 中使用字符串，避免 JavaScript 对 BIGINT 的精度问题
- 所有写请求必须携带 CSRF Token

成功响应：

```json
{
  "success": true,
  "data": {}
}
```

分页响应：

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
```

错误响应：

```json
{
  "success": false,
  "error": {
    "code": "ORDER_STATE_CONFLICT",
    "message": "当前订单状态不允许此操作",
    "requestId": "8c1b..."
  }
}
```

## 2. 鉴权与会话

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/auth/csrf` | 公开 | 建立匿名 Session 并返回 CSRF Token |
| POST | `/auth/register` | 公开 | 注册会员 |
| POST | `/auth/login` | 公开 | 登录并轮换 Session ID |
| POST | `/auth/logout` | 已登录 | 销毁 Session |
| GET | `/auth/session` | 已登录 | 当前用户、角色和 CSRF Token |
| GET | `/auth/profile` | 已登录 | 当前用户个人资料，包含展示名和手机号；历史密钥无法解密手机号时返回空字符串 |
| PATCH | `/auth/profile` | 已登录 | 修改展示名、手机号或密码 |

阶段 1 还提供健康检查与角色壳验证接口：`GET /health/live`、`GET /health/ready`、`GET /member/overview`、`GET /owner/overview`、`GET /admin/overview`。

注册请求包含 `username`、`password`、`phone`。密码最短 8 位，必须同时包含英文大写、小写和数字；注册成功后系统自动生成 `新会员` 加 6 位随机数作为展示名。登录错误不区分“用户不存在”和“密码错误”。

个人资料修改请求可包含 `displayName`、`phone`，手机号为空时可先不提交并由用户重新填写保存；修改密码时必须同时提供 `currentPassword`、`newPassword` 和确认新密码，且两次新密码必须一致；新密码沿用注册密码强度规则。

## 3. 会员资料与地址

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/auth/profile` | 已登录 | 查看自己的资料 |
| PATCH | `/auth/profile` | 已登录 | 修改展示名、手机号或密码 |
| GET | `/member/addresses` | 会员 | 地址列表 |
| POST | `/member/addresses` | 会员 | 新增地址 |

所有地址操作必须以当前 Session 用户 ID 作为查询条件，不能只按地址 ID 操作。

## 4. 开店申请

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/merchant-applications/me` | 会员 | 查看自己的申请 |
| PUT | `/merchant-applications/me` | 会员 | 首次提交或修改后重新提交 |
| GET | `/admin/merchant-applications` | 管理员 | 分页查询申请 |
| POST | `/admin/merchant-applications/:id/approve` | 管理员 | 批准申请并授予店主角色 |
| POST | `/admin/merchant-applications/:id/reject` | 管理员 | 拒绝，必须提供原因 |

审核接口使用当前状态条件更新，只允许审核 `PENDING` 申请。

## 5. 分类、商品与销量展示

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/categories` | 公开 | 正常分类列表 |
| GET | `/products` | 公开 | 商品分页、分类筛选和全文搜索 |
| GET | `/products/:productId` | 公开 | 上架商品详情 |
| GET | `/admin/database/top-products` | 管理员 | 全平台累计有效销量 Top 10 |

`GET /products` 参数：

- `page`、`pageSize`；
- `categoryId`；
- `keyword`；
- `sort`：`relevance`、`priceAsc`、`priceDesc`、`newest`。

无关键词时不允许使用 `relevance` 排序。

## 6. 店主店铺与商品

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/owner/shop` | 店主 | 查看店主资料 |
| PATCH | `/owner/shop` | 店主 | 修改店主资料 |
| GET | `/owner/products` | 店主 | 共享商品分页 |
| POST | `/owner/products` | 店主 | 新增草稿商品 |
| GET | `/owner/products/:productId` | 店主 | 共享商品详情 |
| PATCH | `/owner/products/:productId` | 店主 | 编辑商品 |
| PATCH | `/owner/products/:productId/stock` | 店主 | 调整库存 |
| POST | `/owner/products/:productId/publish` | 店主 | 上架 |
| POST | `/owner/products/:productId/unpublish` | 店主 | 下架 |
| POST | `/owner/products/:productId/archive` | 店主 | 归档 |
| GET | `/owner/products/:productId/price-history` | 店主 | 价格历史 |
| POST | `/uploads/products` | 店主 | 上传商品图片 |

商品由所有店主共享维护，更新条件必须包含 `product_id` 和版本/更新时间。库存接口接收目标库存值和版本/更新时间，用冲突响应防止后台页面覆盖新库存。

## 7. 管理员分类与账号

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/admin/categories` | 管理员 | 分类分页 |
| POST | `/admin/categories` | 管理员 | 新增分类 |
| PATCH | `/admin/categories/:id` | 管理员 | 修改分类 |
| POST | `/admin/categories/:id/disable` | 管理员 | 停用分类 |
| POST | `/admin/categories/:id/enable` | 管理员 | 启用分类 |
用户分页、禁用和启用属于后续补充能力，当前阶段未暴露管理员账号管理 API。当前管理员能力聚焦开店审核、分类管理、审计日志和数据库证据展示。

停用分类不自动下架商品；公开商品查询同时要求分类正常。

## 8. 购物车与结算

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/member/cart` | 会员 | 当前会员购物车 |
| POST | `/member/cart/items` | 会员 | 添加商品或原子增加数量 |
| PATCH | `/member/cart/items/:itemId` | 会员 | 修改数量 |
| DELETE | `/member/cart/items/:itemId` | 会员 | 删除一项 |
| POST | `/member/checkout` | 会员 | 调用存储过程统一结算 |

结算请求：

```json
{
  "addressId": "12",
  "checkoutToken": "UUID"
}
```

结算响应返回总订单号、总金额和子订单摘要。客户端提交的价格和分组信息均被忽略。

## 9. 订单、支付与履约

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/member/orders` | 会员 | 自己的总订单列表 |
| GET | `/member/shop-orders` | 会员 | 自己的子订单列表，用于确认收货 |
| POST | `/member/orders/:orderNo/pay` | 会员 | 模拟支付 |
| POST | `/member/orders/:orderNo/cancel` | 会员 | 取消待支付总订单 |
| POST | `/member/shop-orders/:shopOrderNo/confirm` | 会员 | 确认收货 |
| GET | `/owner/shop-orders` | 店主 | 共享履约子订单列表 |
| POST | `/owner/shop-orders/:shopOrderNo/ship` | 店主 | 发货 |

支付、取消、发货和确认收货都使用带当前状态条件的更新。重复支付和重复状态操作返回原成功状态或 409，不产生重复副作用。

## 10. 退款

退款属于数据库专项和后续补充范围，当前 Stage 5/Stage 6 浏览器演示不暴露退款 API。若后续实现退款接口，金额必须由数据库根据子订单确定，不接受客户端金额，并且批准事务必须恢复库存、更新退款状态、更新子订单状态并写入审计。

## 11. 报表与审计

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/admin/audit-logs` | 管理员 | 最近 50 条审计日志 |
| GET | `/admin/database/top-products` | 管理员 | 基于有效销量视图和窗口函数的 Top 10 |

数据库演示接口不允许执行任意 SQL，只返回预定义视图、元数据和实验结果摘要。

## 12. 稳定错误码

| 错误码 | HTTP | 含义 |
|---|---:|---|
| VALIDATION_ERROR | 400 | 参数不合法 |
| CSRF_INVALID | 403 | CSRF Token 缺失或错误 |
| INVALID_CREDENTIALS | 401 | 用户名或密码错误 |
| AUTH_REQUIRED | 401 | 未登录 |
| ACCOUNT_DISABLED | 401 | 账号禁用 |
| FORBIDDEN | 403 | 角色不足 |
| USERNAME_TAKEN | 409 | 用户名已被使用 |
| SERVICE_NOT_READY | 503 | 服务依赖未就绪 |
| RESOURCE_NOT_OWNED | 403 | 资源不属于当前用户或当前角色无权操作 |
| NOT_FOUND | 404 | 资源不存在 |
| EMPTY_CART | 409 | 购物车为空 |
| OUT_OF_STOCK | 409 | 库存不足 |
| PRODUCT_UNAVAILABLE | 409 | 商品或分类不可用 |
| CATEGORY_NAME_TAKEN | 409 | 分类名已被使用 |
| PRODUCT_STATE_CONFLICT | 409 | 当前商品状态不允许此操作 |
| PRODUCT_VERSION_CONFLICT | 409 | 商品版本已变化，需要刷新后重试 |
| INVALID_IMAGE_FILE | 400 | 上传文件不是允许的图片 |
| IMAGE_TOO_LARGE | 400 | 上传图片超过大小限制 |
| DUPLICATE_APPLICATION | 409 | 申请状态冲突 |
| APPLICATION_STATE_CONFLICT | 409 | 当前申请状态不允许操作 |
| SHOP_NAME_TAKEN | 409 | 店铺名已被使用 |
| ORDER_STATE_CONFLICT | 409 | 订单状态不允许操作 |
| REFUND_STATE_CONFLICT | 409 | 退款状态不允许操作 |
| INTERNAL_ERROR | 500 | 未知服务错误 |

## 13. API 文档维护

实现阶段以版本化 OpenAPI 文件作为机器可读合同。Zod Schema、OpenAPI 和 TypeScript 类型必须保持单一来源或通过自动测试验证一致，禁止三份手工定义长期漂移。
