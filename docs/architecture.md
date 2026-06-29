# NovaMall 系统架构设计

## 1. 架构目标

NovaMall 采用 SQL 优先的模块化单体，目标是在保持项目简单可解释的同时，完整展示数据库课程要求。系统不引入微服务和非必要中间件。

## 2. 系统上下文

```mermaid
flowchart LR
    Guest[游客] --> Web[React Web]
    Member[会员] --> Web
    Owner[店主] --> Web
    Admin[系统管理员] --> Web
    Web -->|HTTPS / JSON / Session Cookie| API[Express API]
    API -->|mysql2 / 参数化 SQL| DB[(MySQL)]
    API --> Files[(商品图片持久化卷)]
```

## 3. 部署架构

```mermaid
flowchart TB
    Browser[浏览器]
    Frontend[React 静态资源 / Nginx]
    Backend[Express API]
    MySQL[(MySQL)]
    Uploads[(uploads 卷)]

    Browser --> Frontend
    Frontend -->|/api 与 /uploads 反向代理| Backend
    Backend --> MySQL
    Backend --> Uploads
```

Docker Compose 包含前端、后端和 MySQL 三个服务。数据库数据和商品图片分别挂载持久化卷。

## 4. 前端架构

一个 React 工程包含三套桌面端布局：

- 商城布局：面向游客和会员，统一按桌面端设计；
- 店主后台布局：面向共享商品经营管理，统一按桌面端设计；
- 系统后台布局：面向审核、分类、账号和审计，桌面端优先。

按功能组织页面和数据访问，不按文件类型堆积全局目录。前端权限仅用于导航和体验，最终权限由后端决定。

## 5. 后端分层

```mermaid
flowchart LR
    Route --> Controller --> Service --> Repository --> MySQL[(MySQL)]
    Middleware[会话、权限、请求编号、错误处理] -.作用于.-> Route
    Service --> Upload[文件服务]
```

### Route

- 声明路径、HTTP 方法和中间件；
- 不包含业务规则和 SQL。

### Controller

- 读取已校验的请求参数；
- 调用 Service；
- 转换为统一 HTTP 响应；
- 不直接访问数据库。

### Service

- 执行业务规则、权限归属和状态机；
- 组织事务边界或调用存储过程；
- 不依赖 Express 的 Request/Response 类型。

### Repository

- 应用层唯一允许执行 SQL 的位置；
- 使用 mysql2 参数化查询；
- 将数据库行转换为明确 TypeScript 类型；
- 不决定 HTTP 状态码。

## 6. 后端业务模块

- `auth`：注册、登录、退出和 Session；
- `users`：资料、地址和账号状态；
- `merchant-applications`：开店申请与审核；
- `shops`：店铺资料与归属；
- `categories`：平台分类；
- `products`：商品、库存、图片和价格历史；
- `cart`：购物车；
- `checkout`：统一结算存储过程；
- `orders`：总订单、子订单、发货和确认收货；
- `payments`：模拟支付；
- `refunds`：退款申请与审核；
- `analytics`：销售汇总和 Top 10；
- `audits`：审计查询；
- `uploads`：本地图片上传。

## 7. 关键数据流

### 统一结算

```mermaid
sequenceDiagram
    participant M as 会员
    participant API as Checkout Service
    participant SP as sp_checkout_cart
    participant DB as MySQL

    M->>API: 提交地址并结算购物车
    API->>SP: IN user_id, address_id, checkout_token, OUT order_no
    SP->>DB: BEGIN / 按 product_id 锁库存行
    SP->>DB: 校验商品、分类、价格和库存
    SP->>DB: 创建总订单、子订单和明细快照
    SP->>DB: 扣库存、创建待支付记录、清空购物车
    alt 全部成功
        SP->>DB: COMMIT
        SP-->>API: order_no
        API-->>M: 订单创建成功
    else 任一步失败
        SP->>DB: ROLLBACK
        API-->>M: 稳定业务错误
    end
```

### 模拟支付

支付事务锁定总订单和支付记录，确认订单仍为待支付后，一次性更新支付记录、总订单和全部子订单。重复支付返回原成功结果或冲突，不重复记账。

结算请求携带唯一 `checkout_token`。数据库对该令牌建立唯一约束；同一会员重复提交相同令牌时返回既有订单，避免网络重试造成重复扣库存。

### 退款

退款申请仅针对待发货子订单。批准事务锁定退款、子订单和关联商品，恢复库存后更新退款、子订单及总订单聚合状态。

## 8. 订单状态机

### 总订单

```mermaid
stateDiagram-v2
    [*] --> PENDING_PAYMENT
    PENDING_PAYMENT --> PAID: 模拟支付成功
    PENDING_PAYMENT --> CANCELLED: 会员取消
    PAID --> FULFILLING: 任一子订单发货或退款处理中
    PAID --> PARTIALLY_REFUNDED: 全部子订单终态且部分退款
    FULFILLING --> PARTIALLY_REFUNDED: 全部子订单终态且部分退款
    FULFILLING --> COMPLETED: 全部未退款子订单完成
    PAID --> REFUNDED: 全部子订单退款
    CANCELLED --> [*]
    COMPLETED --> [*]
    PARTIALLY_REFUNDED --> [*]
    REFUNDED --> [*]
```

### 店铺子订单

```mermaid
stateDiagram-v2
    [*] --> PENDING_PAYMENT
    PENDING_PAYMENT --> PENDING_SHIPMENT: 总订单支付成功
    PENDING_PAYMENT --> CANCELLED: 总订单取消
    PENDING_SHIPMENT --> SHIPPED: 店主发货
    PENDING_SHIPMENT --> REFUND_PENDING: 会员申请退款
    REFUND_PENDING --> REFUNDED: 店主批准
    REFUND_PENDING --> PENDING_SHIPMENT: 店主拒绝
    SHIPPED --> COMPLETED: 会员确认收货
    CANCELLED --> [*]
    REFUNDED --> [*]
    COMPLETED --> [*]
```

总订单状态由子订单状态聚合。每次迁移均使用“当前状态 + 主键”条件更新，受影响行数为 0 时返回状态冲突。

## 9. 错误处理

统一错误响应：

```json
{
  "success": false,
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "商品库存不足",
    "requestId": "请求编号"
  }
}
```

- 400：参数校验失败；
- 401：未登录或 Session 失效；
- 403：角色或资源归属不允许；
- 404：资源不存在；
- 409：库存不足、重复申请或非法状态迁移；
- 500：未知错误，不暴露 SQL、堆栈和密钥。

存储过程使用稳定业务码表示预期失败。未知数据库错误统一记录请求编号并返回通用错误。

## 10. 视觉方向

品牌采用深海军蓝、星光金和暖白配色。会员商城突出商品与搜索；后台界面强调信息密度、状态和可操作性。动画只用于状态反馈和页面过渡，并尊重减少动态效果设置。

## 11. 关键取舍

- 选择模块化单体而非微服务：业务规模有限，事务一致性更重要。
- 选择 mysql2 而非 ORM：需要直接展示高级 SQL 和执行计划。
- 选择服务端 Session 而非前端存 JWT：权限变更和退出立即生效。
- 选择本地图片卷而非对象存储：离线课程演示更稳定。
- 选择整单退款而非完整售后：形成闭环但控制范围。
