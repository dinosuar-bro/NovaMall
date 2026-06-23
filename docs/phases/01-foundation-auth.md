# Stage 1：基础设施与认证闭环规格

## 1. 阶段目标

在 `dev-1` 分支建立可运行的 pnpm workspace、React 前端、Express API、MySQL 数据库和 Docker Compose，并交付一个真实可验证的认证闭环：会员注册、登录、查看会话、退出；管理员和店主测试账号可进入各自空后台；越权访问被后端拒绝。

本阶段只建立认证和三角色应用壳，不实现开店申请、商品、购物车和订单。

## 2. 成功标准

- 从空数据库执行迁移并写入 MEMBER、OWNER、ADMIN 固定角色；
- 用户注册后自动获得 MEMBER 角色；
- 密码使用 scrypt 不可逆保存，手机号通过 MySQL AES 加密保存；
- 登录状态保存在 MySQL Session，浏览器只持有 HttpOnly Cookie；
- 登录后 Session ID 轮换，退出后原 Session 失效；
- 账号状态和角色在每个受保护请求中重新验证；
- 所有写请求验证与 Session 绑定的 CSRF Token；
- React 提供登录、注册、会员首页壳、店主后台壳和管理员后台壳；
- `docker compose up --build` 可启动前端、后端和 MySQL；
- 类型检查、Lint、单元测试、集成测试、E2E 和构建通过。

## 3. 非目标

- 开店申请和审核；
- 店铺、分类、商品、图片上传；
- 地址、购物车、订单、支付和退款；
- 完整后台表格和经营数据；
- 真实第三方登录；
- Redis、消息队列和微服务。

## 4. 工程结构

```text
NovaMall/
├── apps/
│   ├── api/                  # Express API
│   │   ├── src/
│   │   │   ├── app.ts       # 组装中间件与路由
│   │   │   ├── server.ts    # 启动与优雅退出
│   │   │   ├── config/      # 环境变量与数据库配置
│   │   │   ├── db/          # 连接池、事务与迁移状态
│   │   │   ├── middleware/  # requestId、Session、CSRF、错误处理
│   │   │   ├── modules/auth/# route/controller/service/repository/schema
│   │   │   └── modules/health/
│   │   └── tests/
│   └── web/                  # React + Vite
│       ├── src/
│       │   ├── app/          # Router、Provider、角色守卫
│       │   ├── features/auth/# 登录、注册、会话请求
│       │   ├── layouts/      # 会员、店主、管理员壳
│       │   ├── pages/        # 认证页与阶段空状态
│       │   ├── styles/       # OKLCH tokens 与全局样式
│       │   └── ui/           # Button、Field、Alert、Spinner 等
│       └── tests/
├── packages/
│   └── shared/               # Zod 合同、DTO、错误码、角色类型
├── database/
│   ├── migrations/           # 版本化 SQL
│   └── seeds/                # 本地演示账号创建工具
├── docker/
│   └── nginx.conf
├── PRODUCT.md
├── DESIGN.md
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

所有业务 TypeScript 文件禁止 `any`。API 调用方向固定为 Route → Controller → Service → Repository。

## 5. 数据库设计

### 5.1 users

沿用 `docs/database/er-and-relational-design.md`：

- `id BIGINT UNSIGNED` 主键；
- `username VARCHAR(50)` 唯一；
- `password_hash VARCHAR(255)`；
- `display_name VARCHAR(100)`；
- `phone_cipher VARBINARY(255)`；
- `phone_iv BINARY(16)`；
- `status VARCHAR(20)`，仅允许 ACTIVE、DISABLED；
- 毫秒级创建和更新时间。

### 5.2 roles

固定角色 MEMBER、OWNER、ADMIN。迁移创建表并幂等写入固定角色。

### 5.3 user_roles

以 `(user_id, role_id)` 为复合主键，记录授权时间和授权人。注册事务授予 MEMBER；本阶段 OWNER、ADMIN 通过受控 `seed-demo` 命令创建演示账号。

### 5.4 sessions

Session Store 使用 MySQL 表保存 Session ID、过期时间和序列化数据。Cookie 不包含角色或手机号。测试环境使用独立 Session 表/数据库。

### 5.5 加密与连接上下文

- 数据库会话明确设置 `block_encryption_mode = 'aes-256-cbc'`；
- Node 使用密码学安全随机源生成 16 字节 IV；
- AES Key 来自 `PHONE_AES_KEY`，不进入 SQL 文件或日志；
- Repository 使用参数化 `AES_ENCRYPT` / `AES_DECRYPT`；
- API 只在 `/users/me` 类授权场景返回解密手机号；
- scrypt 编码串包含版本、参数、盐和摘要，比较使用恒定时间函数。

## 6. API 合同

统一前缀 `/api/v1`，成功和错误结构遵循 `docs/api.md`。

| 方法 | 路径 | 权限 | 行为 |
|---|---|---|---|
| GET | `/health/live` | 公开 | 仅验证进程存活 |
| GET | `/health/ready` | 公开 | 验证数据库和迁移状态 |
| GET | `/auth/csrf` | 公开 | 建立匿名 Session 并返回 CSRF Token |
| POST | `/auth/register` | 公开 + CSRF bootstrap | 注册并自动登录 |
| POST | `/auth/login` | 公开 + CSRF bootstrap | 校验凭据并轮换 Session |
| POST | `/auth/logout` | 已登录 + CSRF | 销毁服务端 Session |
| GET | `/auth/session` | 已登录 | 返回当前用户、角色和 CSRF Token |
| GET | `/member/overview` | MEMBER | 会员壳验证接口 |
| GET | `/owner/overview` | OWNER | 店主壳验证接口 |
| GET | `/admin/overview` | ADMIN | 管理员壳验证接口 |

注册输入：`username`、`password`、`displayName`、`phone`。登录失败统一返回 `INVALID_CREDENTIALS`，不泄露用户名是否存在。

### CSRF bootstrap

匿名访问认证页面时，前端先请求 `GET /api/v1/auth/csrf`，服务端建立匿名 Session 并返回 Token；后续注册、登录和写请求通过 `X-CSRF-Token` Header 提交。Token 存入 Session，注册或登录轮换 Session ID 后重新生成，并通过成功响应返回新的 Token。

## 7. 前端信息架构

### 认证页

- 左侧/上方为简短品牌说明，右侧/下方为表单；移动端转为单列；
- 登录和注册使用明确独立路由，不用难以返回的全屏模式切换；
- 字段包含持久标签、帮助/错误文本、密码可见性按钮和提交状态；
- 服务端字段错误映射回对应控件，未知错误显示 requestId。

### 角色应用壳

- MEMBER：顶部导航和“商城功能即将开放”的可操作空状态；
- OWNER：桌面侧栏，展示店铺阶段尚未开放并引导等待 Stage 2；
- ADMIN：桌面侧栏，展示审核与管理功能尚未开放；
- 多角色用户默认进入最近/优先角色，可从账号菜单切换已拥有角色视图；
- 前端守卫改善体验，后端权限中间件仍是最终安全边界。

## 8. 视觉与动效

遵循根目录 `PRODUCT.md` 和 `DESIGN.md`。Stage 1 实现真实 OKLCH tokens 后，重新运行 `$impeccable document` 将种子文档升级为可扫描设计系统。

### 视觉

- Restrained 浅色产品界面；
- 暖珊瑚作为主要操作和当前状态色，纯白背景；
- 单一温暖人文无衬线字体栈；
- 普通容器圆角不超过 16px；
- 不使用奶油米色、玻璃拟态、渐变文字和重复同构卡片。

### GSAP

- 使用 `gsap` 和 `@gsap/react`；
- React 动画使用 `useGSAP`，目标通过 ref/scoped selector 限定并自动清理；
- 登录/注册路由进入时只做 180–240ms 的短位移与 autoAlpha 反馈，不编排多段页面表演；
- 表单错误摘要出现、角色视图切换和成功状态使用 GSAP 表达状态变化；
- transform 与 autoAlpha 优先，禁止动画 width、height、top、left；
- 使用 `gsap.matchMedia()` 尊重 `prefers-reduced-motion`；减少动态效果时即时切换或仅交叉淡化；
- 内容默认可见，动画失败时页面仍完整可用。

## 9. 安全与错误

- 环境变量在启动时由 Zod 严格验证；
- SQL 全部参数化，排序/标识符只允许白名单；
- Session Cookie：HttpOnly、SameSite=Lax，生产 Secure；
- 登录后轮换 Session ID，退出销毁；
- CSRF Token 与 Session 绑定并使用恒定时间比较；
- 账号禁用和角色变化在每次受保护请求重新查询；
- 生产错误不返回堆栈、SQL、Cookie、密码或手机号；
- 每个响应包含/可关联 requestId；
- 日志对请求体敏感字段脱敏。

## 10. 测试策略

### 后端单元测试

- scrypt 编码与正确/错误密码比较；
- 数据库错误到稳定业务错误码的映射；
- CSRF 生成与比较；
- 角色授权判断；
- 环境变量解析。

### MySQL/API 集成测试

- 空库迁移和固定角色种子；
- 注册事务写入 users 和 MEMBER 角色；
- 数据库中手机号不可读，授权查询可正确解密；
- 重复用户名返回 409；
- 登录轮换 Session，退出后旧 Cookie 返回 401；
- 禁用账号和角色越权返回 401/403；
- CSRF 缺失或错误时写请求被拒绝；
- ready 健康检查在数据库不可用时失败。

### 前端测试

- 登录/注册字段、键盘操作、错误关联和加载状态；
- Session 恢复与角色路由守卫；
- 减少动态效果时不执行位移动画；
- 三种角色空状态内容准确。

### E2E

1. 新会员注册后进入 MEMBER 壳；
2. 退出后受保护页面跳转登录；
3. MEMBER 无法进入 OWNER/ADMIN；
4. 种子 OWNER 和 ADMIN 登录后进入各自应用壳；
5. 移动视口完成注册，桌面视口完成后台登录。

## 11. Docker 与运行

- Compose 服务：frontend、backend、mysql；
- MySQL 和上传目录使用命名卷，本阶段暂不实现图片上传；
- frontend 通过 Nginx 提供静态资源并代理 `/api`；
- backend 暴露 live/ready 健康检查；
- MySQL 健康后 backend 才进入 ready；
- `.env.example` 只含变量名与生成说明；
- 缺少强制 Secret 时 backend 安全失败。

## 12. 阶段验收命令

实施后至少提供并执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
docker compose config
docker compose up --build
git diff --check
```

实际脚本名称若与此不同，必须先更新本文档并重新确认。

## 13. 完成定义

- 本文范围全部实现，非目标未提前开发；
- PRODUCT、DESIGN、README、API、数据库和安全文档与代码一致；
- 全部质量门禁通过并报告真实输出；
- 浏览器实际检查桌面和移动界面；
- 对比度、键盘、焦点、错误关联和 reduced motion 验证通过；
- Docker 从空卷可启动，重启后 Session/数据库行为符合设计；
- 没有 Secret、真实手机号、数据卷和测试产物进入 Git。
