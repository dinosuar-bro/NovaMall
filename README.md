# NovaMall（星选）

NovaMall 是一个面向《数据库课程设计》的网上购物系统。项目以数据库设计和可验证的高级数据库技术为核心，采用 React、Express 与 MySQL 构建。

> 当前状态：阶段 1 至阶段 6 已完成，课程证据、演示脚本和交付文档已收尾。系统已具备认证、商户入驻、分类管理、店主商品发布、公开商品搜索、购物车、统一结算、模拟支付、店主发货、会员确认收货和管理员数据库证据只读展示。

## 项目目标

系统包含会员、店主和系统管理员三类角色，覆盖以下核心业务：

- 会员注册、登录和个人资料管理；
- 会员提交开店申请，管理员审核后创建店铺；
- 店主共同维护平台共享商品、库存和图片；
- 商品分类、名称查找、全文检索及商品详情；
- 购物车添加、修改、删除与统一结算；
- 一次结算生成平台总订单和履约子订单；
- 模拟支付、发货和确认收货；
- 查询全平台累计有效销量 Top 10 商品；
- 管理员管理用户、分类、审核和审计日志。

## 技术栈

- 前端：React + TypeScript
- 后端：Express + TypeScript
- 数据库：MySQL
- 数据访问：mysql2 原生 SQL，不使用 ORM
- 参数校验：Zod
- 包管理：pnpm workspace
- 部署：Docker Compose

项目采用模块化单体结构：

```text
Route → Controller → Service → Repository → MySQL
```

## 当前已完成能力

- 认证：注册、登录、退出、Session、CSRF、密码 scrypt 哈希、手机号 AES 加密；
- 注册规则：展示名自动生成为 `新会员` 加 6 位随机数，密码最短 8 位且包含英文大写、小写和数字；
- 个人主页：`/profile` 可修改展示名、手机号和密码，修改密码需要当前密码和确认新密码；
- 路由拆分：会员、店主、管理员功能分别位于独立路由，通过侧边导航切换；
- 商户入驻：会员提交申请，管理员批准或拒绝，批准后创建店铺并授予 OWNER；
- 商品目录：管理员分类管理，店主共同创建、上传图片、上架平台共享商品，会员可按分类和关键词浏览公开商品；
- 图片处理：商品图片通过后端上传并写入 `/uploads/products/...`，Docker 使用 `uploads-data` 卷持久化；历史图片缺失时前端显示统一占位图；
- 数据库：已包含认证、商户入驻、商品目录和最小订单域迁移，覆盖存储过程、触发器、视图、审计日志、价格历史、窗口函数、复合索引、事务并发控制、AES 加密和 FULLTEXT ngram 索引；
- 演示闭环：会员可从商品目录加购、保存地址、在结算前确认商品明细、完成统一结算、模拟支付并确认收货；店主可查看共享履约子订单并发货；管理员可只读查看审计日志和有效销量 Top 10。
- 阶段证据：Stage 6 已建立 `docs/evidence/database/` 拆分证据目录，已补齐存储过程、触发器、视图、索引、事务并发、窗口函数、审计日志、全文检索和 AES 加密证据；性能结论仅限当前确定性数据集和本地 MySQL 环境。

## 高阶数据库技术

项目已实现并分阶段验证 9 项高阶数据库技术：

1. 带输入/输出参数的存储过程；
2. 触发器；
3. 视图；
4. 索引优化与执行计划对比；
5. 事务与并发控制；
6. 窗口函数；
7. 审计日志；
8. 全文检索；
9. 手机号 AES 加密存储。

## 文档导航

- [项目需求说明](docs/requirements.md)
- [系统架构设计](docs/architecture.md)
- [数据库 ER 图与关系模式](docs/database/er-and-relational-design.md)
- [数据库范式与完整性约束](docs/database/normalization-and-integrity.md)
- [高阶数据库技术设计](docs/database/advanced-technologies.md)
- [数据库实验与证据计划](docs/database/experiment-plan.md)
- [API 设计](docs/api.md)
- [安全设计](docs/security.md)
- [前端与交互设计](docs/ui-design.md)
- [测试与验收](docs/testing-and-acceptance.md)
- [分阶段开发计划](docs/development-plan.md)
- [部署与运维](docs/deployment.md)
- [课程报告编写指南](docs/course-report-guide.md)
- [最终演示脚本](docs/final-demo-script.md)

## 开发原则

- 文档先行：每个阶段先确认需求、接口、数据结构和验收标准，再编写代码。
- 最小闭环：每个阶段必须形成可运行、可演示、可自动验证的业务闭环。
- SQL 优先：数据库能力使用显式 SQL 实现，不以 ORM 隐藏关键逻辑。
- 范围控制：不实现 SKU、优惠券、真实支付、物流接口和完整退货流程。
- 证据驱动：性能数字、执行计划和并发结果必须来自真实实验。

## 运行说明

### 本地验证

```bash
pnpm install
docker compose -f docker-compose.test.yml up -d mysql-test
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' pnpm db:test:migrate
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm test:integration
CI=true pnpm build
```

测试 MySQL 使用宿主机 `3308` 端口，避免占用本机默认 `3306`。

### 开发启动

复制 `.env.example` 为 `.env` 并替换 Secret 后：

```bash
pnpm dev
```

前端开发服务通过 Vite proxy 转发 `/api` 到 `http://localhost:3000`。

### Docker 启动

```bash
docker compose config
docker compose up --build
```

当前 Compose 公开前端 `http://localhost:8080`，Nginx 将 `/api` 代理到后端；主库 MySQL 为了本地调试映射到宿主机 `3307`，测试库映射到 `3308`。

主库 Navicat / DataGrip 连接参数：

```text
Host: 127.0.0.1
Port: 3307
User: root
Password: novamall_root_dev_password
Database: novamall
```

测试库连接参数：

```text
Host: 127.0.0.1
Port: 3308
User: novamall
Password: novamall_test_password
Database: novamall_test
```

Docker 数据卷：

- `novamall_mysql-data`：主库数据；
- `novamall_uploads-data`：商品上传图片；
- `novamall-mysql-test-1`：测试库容器，测试命令可能清空其中数据。

准备课程演示店主、管理员和基础演示数据：

```bash
docker compose run --rm seed-demo
```

演示账号为 `demo_owner`、`demo_admin`，密码均为 `StrongPass123!`。该脚本仅用于课程演示和 E2E，不属于数据库结构迁移。

### 一键启动

```bash
pnpm start:all
```

该命令会通过 `scripts/start.sh` 校验 Docker Compose 配置，构建并后台启动 MySQL、数据库迁移、后端与前端。启动完成后访问 `http://localhost:8080`。

### 常见排查

- 修改前端或后端代码后，只执行 `docker compose restart` 不会更新镜像中的静态资源；需要执行 `docker compose up --build -d`。
- 商品旧图片如果对应上传文件已经丢失，会显示统一占位图；新上传文件会写入 `uploads-data` 卷，容器重建后仍保留。
- 个人资料页若历史手机号因旧 AES Key 无法解密，会显示空手机号，用户重新填写并保存后会使用当前 Key 重写。

## 许可证

本项目使用 MIT License，详见仓库根目录 `LICENSE`。
