# 部署与运维设计

## 1. 部署目标

使用 Docker Compose 在课程演示环境一键启动前端、后端和 MySQL，并保证数据库与商品图片在容器重启后保留。

## 2. 服务组成

| 服务 | 职责 | 对外暴露 |
|---|---|---|
| frontend | 构建 React 并由 Nginx 提供静态资源、反向代理 API/图片 | Web 端口 |
| backend | Express API、Session、图片上传、数据库访问 | 仅 Compose 网络或调试端口 |
| mysql | MySQL 8.4、业务数据、存储过程、触发器和视图 | 本地调试映射到 `127.0.0.1:3307` |

## 3. 持久化

- `mysql-data`：MySQL 数据目录；
- `uploads-data`：商品上传图片，挂载到后端容器 `/app/uploads`；
- 数据库迁移脚本随应用版本进入镜像，不保存在数据卷中。

## 4. 环境变量

计划变量：

```text
NODE_ENV
PORT
APP_ORIGIN
DATABASE_HOST
DATABASE_PORT
DATABASE_NAME
DATABASE_USER
DATABASE_PASSWORD
SESSION_SECRET
PHONE_AES_KEY
UPLOAD_DIR
MAX_UPLOAD_BYTES
```

`.env.example` 只提供变量名和说明，不包含真实 Secret。缺少 Session Secret、AES Key 或数据库凭据时，后端必须拒绝启动。

## 5. 网络与代理

- 浏览器只访问 frontend；
- Nginx 将 `/api` 代理到 backend，前端商品图片通过 `/api/v1/uploads/...` 读取；
- backend 通过内部 Compose 网络访问 mysql；
- 本机数据库工具可通过 `127.0.0.1:3307` 连接主库，通过 `127.0.0.1:3308` 连接测试库；
- 生产部署启用 HTTPS，确保 Cookie Secure 和数据库加密参数不会经过不可信网络。

## 6. 健康检查

### MySQL

使用 `mysqladmin ping` 或等价只读探针，确认服务可连接。

### Backend

- `/health/live`：进程存活，不访问数据库；
- `/health/ready`：数据库可查询且迁移版本符合要求。

### Frontend

检查静态首页和反向代理可达。

Compose 使用健康依赖，避免后端在 MySQL 未就绪时盲目启动。

## 7. 数据库迁移

- 所有迁移版本化并按顺序执行；
- 迁移包含表、约束、索引、视图、触发器和存储过程；
- 开发和测试从空库验证完整迁移；
- 不在应用启动时使用 ORM 自动同步；
- 破坏性迁移必须附恢复与数据迁移说明。

具体迁移工具在阶段 1 文档中核对官方支持和版本后确定。

## 8. 初始化数据

- 固定角色 MEMBER、OWNER、ADMIN；
- 演示管理员通过显式初始化命令创建，不在 SQL 中写死密码；
- 演示商品和订单由可重复种子脚本生成；
- 性能数据与日常演示数据分离。

## 9. 备份与恢复策略

备份恢复不属于本次 9 项计分技术，但项目仍保留基本策略：

- 演示前使用 `mysqldump` 创建逻辑全量备份；
- 备份文件加密并放在仓库外；
- 图片卷与数据库备份使用同一时间点标记；
- 在独立临时数据库执行恢复演练；
- 记录备份版本、时间、迁移版本和校验结果。

在未实际执行恢复演练前，不声称备份可恢复。Stage 6 已保留备份恢复策略和演示前备份建议，独立恢复演练可作为后续补充项。

## 10. 日志与排障

- 应用日志输出到标准输出，由 Docker 收集；
- 每条请求日志包含 requestId、路径、状态码和耗时；
- 不记录 Cookie、密码、手机号明文和 Secret；
- 数据库慢查询只在受控环境启用；
- 常见故障排查以实际命令为准：静态资源更新后执行 `docker compose up --build -d`，健康检查使用 `/api/v1/health/live`，数据库调试分别连接 `127.0.0.1:3307` 主库和 `127.0.0.1:3308` 测试库。

## 11. 阶段部署验收

- 空卷启动成功；
- 迁移和种子数据成功；
- 三项健康检查通过；
- 重启后数据库和图片仍存在；
- 缺失 Secret 时安全失败；
- 完成 Stage 6 阶段 E2E；
- 备份策略已记录；
- 若未执行独立恢复演练，必须在验收记录中标注“未验证”，不能声称备份已可恢复。
