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

阶段 1 还提供健康检查与角色壳验证接口：`GET /health/live`、`GET /health/ready`、`GET /member/overview`、`GET /owner/overview`、`GET /admin/overview`。

注册请求包含 `username`、`password`、`displayName`、`phone`。登录错误不区分“用户不存在”和“密码错误”。

## 3. 会员资料与地址

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/users/me` | 会员 | 查看自己的资料 |
| PATCH | `/users/me` | 会员 | 修改姓名或手机号 |
| GET | `/users/me/addresses` | 会员 | 地址列表 |
| POST | `/users/me/addresses` | 会员 | 新增地址 |
| PATCH | `/users/me/addresses/:addressId` | 会员 | 修改自己的地址 |
| DELETE | `/users/me/addresses/:addressId` | 会员 | 删除自己的地址 |
| PUT | `/users/me/addresses/:addressId/default` | 会员 | 事务化设置默认地址 |

所有地址操作必须以当前 Session 用户 ID 作为查询条件，不能只按地址 ID 操作。

## 4. 开店申请

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/merchant-applications/me` | 会员 | 查看自己的申请 |
| PUT | `/merchant-applications/me` | 会员 | 首次提交或修改后重新提交 |
| GET | `/admin/merchant-applications` | 管理员 | 分页查询申请 |
| POST | `/admin/merchant-applications/:id/approve` | 管理员 | 批准并创建店铺、授予角色 |
| POST | `/admin/merchant-applications/:id/reject` | 管理员 | 拒绝，必须提供原因 |

审核接口使用当前状态条件更新，只允许审核 `PENDING` 申请。

## 5. 分类与商品公开接口

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/categories` | 公开 | 正常分类列表 |
| GET | `/products` | 公开 | 商品分页、分类筛选和全文搜索 |
| GET | `/products/:productId` | 公开 | 上架商品详情 |
| GET | `/analytics/products/top10` | 公开 | 全平台累计有效销量 Top 10 |

`GET /products` 参数：

- `page`、`pageSize`；
- `categoryId`；
- `keyword`；
- `sort`：`relevance`、`priceAsc`、`priceDesc`、`newest`。

无关键词时不允许使用 `relevance` 排序。

## 6. 店主店铺与商品

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/owner/shop` | 店主 | 查看自己的店铺 |
| PATCH | `/owner/shop` | 店主 | 修改店铺资料 |
| GET | `/owner/products` | 店主 | 本店商品分页 |
| POST | `/owner/products` | 店主 | 新增草稿商品 |
| GET | `/owner/products/:productId` | 店主 | 本店商品详情 |
| PATCH | `/owner/products/:productId` | 店主 | 编辑商品 |
| PATCH | `/owner/products/:productId/stock` | 店主 | 调整库存 |
| POST | `/owner/products/:productId/publish` | 店主 | 上架 |
| POST | `/owner/products/:productId/unpublish` | 店主 | 下架 |
| POST | `/owner/products/:productId/archive` | 店主 | 归档 |
| GET | `/owner/products/:productId/price-history` | 店主 | 价格历史 |
| POST | `/uploads/products` | 店主 | 上传商品图片 |

更新条件必须包含 `product_id` 和当前店铺 ID。库存接口接收目标库存值和版本/更新时间，用冲突响应防止后台页面覆盖新库存。

## 7. 管理员分类与账号

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/admin/categories` | 管理员 | 分类分页 |
| POST | `/admin/categories` | 管理员 | 新增分类 |
| PATCH | `/admin/categories/:id` | 管理员 | 修改分类 |
| POST | `/admin/categories/:id/disable` | 管理员 | 停用分类 |
| POST | `/admin/categories/:id/enable` | 管理员 | 启用分类 |
| GET | `/admin/users` | 管理员 | 用户分页与角色筛选 |
| POST | `/admin/users/:id/disable` | 管理员 | 禁用账号 |
| POST | `/admin/users/:id/enable` | 管理员 | 启用账号 |

停用分类不自动下架商品；公开商品查询同时要求分类正常。

## 8. 购物车与结算

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/cart` | 会员 | 按店铺聚合购物车 |
| POST | `/cart/items` | 会员 | 添加商品或原子增加数量 |
| PATCH | `/cart/items/:itemId` | 会员 | 修改数量 |
| DELETE | `/cart/items/:itemId` | 会员 | 删除一项 |
| DELETE | `/cart` | 会员 | 清空购物车 |
| POST | `/checkout` | 会员 | 调用存储过程跨店结算 |

结算请求：

```json
{
  "addressId": "12",
  "checkoutToken": "UUID"
}
```

结算响应返回总订单号、总金额和子订单摘要。客户端提交的价格和店铺分组均被忽略。

## 9. 订单、支付与履约

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/orders` | 会员 | 自己的总订单分页 |
| GET | `/orders/:orderNo` | 会员 | 自己的订单详情 |
| POST | `/orders/:orderNo/pay` | 会员 | 模拟支付 |
| POST | `/orders/:orderNo/cancel` | 会员 | 取消待支付总订单 |
| POST | `/shop-orders/:shopOrderNo/confirm` | 会员 | 确认收货 |
| GET | `/owner/orders` | 店主 | 本店子订单分页 |
| GET | `/owner/orders/:shopOrderNo` | 店主 | 本店子订单详情 |
| POST | `/owner/orders/:shopOrderNo/ship` | 店主 | 发货 |
| GET | `/admin/orders` | 管理员 | 全平台只读查询 |

支付、取消、发货和确认收货都使用带当前状态条件的更新。重复支付和重复状态操作返回原成功状态或 409，不产生重复副作用。

## 10. 退款

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| POST | `/shop-orders/:shopOrderNo/refund` | 会员 | 对自己的待发货子订单申请整单退款 |
| GET | `/refunds` | 会员 | 自己的退款记录 |
| GET | `/owner/refunds` | 店主 | 本店待审核/历史退款 |
| POST | `/owner/refunds/:refundNo/approve` | 店主 | 批准并恢复库存 |
| POST | `/owner/refunds/:refundNo/reject` | 店主 | 拒绝，必须填写原因 |

退款金额由数据库根据子订单确定，不接受客户端金额。

## 11. 报表与审计

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/owner/analytics/summary` | 店主 | 本店销售汇总 |
| GET | `/admin/analytics/summary` | 管理员 | 平台汇总 |
| GET | `/admin/audits` | 管理员 | 审计日志分页与筛选 |
| GET | `/admin/database-demo` | 管理员 | 9 项技术的只读演示信息 |

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
| RESOURCE_NOT_OWNED | 403 | 资源不属于当前用户/店铺 |
| NOT_FOUND | 404 | 资源不存在 |
| EMPTY_CART | 409 | 购物车为空 |
| OUT_OF_STOCK | 409 | 库存不足 |
| PRODUCT_UNAVAILABLE | 409 | 商品或店铺不可用 |
| DUPLICATE_APPLICATION | 409 | 申请状态冲突 |
| ORDER_STATE_CONFLICT | 409 | 订单状态不允许操作 |
| REFUND_STATE_CONFLICT | 409 | 退款状态不允许操作 |
| INTERNAL_ERROR | 500 | 未知服务错误 |

## 13. API 文档维护

实现阶段以版本化 OpenAPI 文件作为机器可读合同。Zod Schema、OpenAPI 和 TypeScript 类型必须保持单一来源或通过自动测试验证一致，禁止三份手工定义长期漂移。
