# Stage 6 阶段演示脚本

## 1. 演示目标

用最短路径展示 NovaMall 当前已实现能力和数据库课程证据。该脚本用于 Stage 6 阶段验收，不表示项目后续不再补充功能。

## 2. 启动环境

```bash
pnpm install
docker compose config
docker compose up --build -d
docker compose run --rm seed-demo
```

访问入口：

```text
http://localhost:8080
```

主库连接：

```text
Host: 127.0.0.1
Port: 3307
User: root
Password: novamall_root_dev_password
Database: novamall
```

## 3. 演示账号

| 角色 | 用户名 | 密码 |
|---|---|---|
| 店主 | `demo_owner` | `StrongPass123!` |
| 管理员 | `demo_admin` | `StrongPass123!` |
| 会员 | 现场注册或使用 E2E 生成账号 | `StrongPass123!` |

## 4. 浏览器主线

1. 注册或登录会员账号；
2. 会员提交开店申请；
3. 管理员登录，批准开店申请；
4. 店主登录，创建分类关联商品并上传图片；
5. 店主上架商品；
6. 会员按分类或关键词搜索商品；
7. 会员加入购物车，确认商品卡片高亮和“已加入购物车”提示；
8. 会员进入 `购物车`，新增收货地址；
9. 会员在购物车中修改数量或删除商品，数量输入失焦或回车后自动更新；
10. 会员点击提交结算，在“确认结算明细”弹窗中核对商品名、数量、单价、小计和总价；
11. 会员确认统一结算；
12. 会员进入 `订单列表` 并模拟支付；
13. 店主进入订单履约并发货；
14. 会员在 `订单列表` 确认收货；
15. 管理员查看审计日志和有效销量 Top 10。

## 5. 数据库证据展示顺序

按下列文件展示，不从前端执行任意 SQL：

1. `docs/evidence/database/01-存储过程.md`
2. `docs/evidence/database/02-触发器.md`
3. `docs/evidence/database/03-视图.md`
4. `docs/evidence/database/04-索引优化.md`
5. `docs/evidence/database/05-事务与并发控制.md`
6. `docs/evidence/database/06-窗口函数.md`
7. `docs/evidence/database/07-审计日志.md`
8. `docs/evidence/database/08-全文检索.md`
9. `docs/evidence/database/09-AES数据加密.md`

## 6. 可复制 SQL 兜底

检查存储过程、触发器和视图对象：

```sql
SELECT ROUTINE_NAME
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
ORDER BY ROUTINE_NAME;

SELECT TRIGGER_NAME
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
ORDER BY TRIGGER_NAME;

SELECT TABLE_NAME
FROM information_schema.VIEWS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;
```

查看有效销量 Top 10：

```sql
SELECT product_id, product_name, sold_quantity, sales_amount, sales_rank
FROM (
  SELECT
    product_id,
    product_name,
    sold_quantity,
    sales_amount,
    ROW_NUMBER() OVER (
      ORDER BY
        sold_quantity DESC,
        CAST(sales_amount AS DECIMAL(12,2)) DESC,
        CAST(product_id AS UNSIGNED) ASC
    ) AS sales_rank
  FROM v_effective_product_sales
) ranked
WHERE sales_rank <= 10
ORDER BY sales_rank;
```

## 7. 重置和重新准备

谨慎操作：以下命令会重建容器并可能影响本地开发数据。演示前如需干净环境，先备份或确认数据可丢弃。

```bash
docker compose down
docker compose up --build -d
docker compose run --rm seed-demo
```

测试库专项验证使用：

```bash
docker compose -f docker-compose.test.yml up -d mysql-test
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' pnpm db:test:migrate
TEST_DATABASE_URL='mysql://novamall:novamall_test_password@127.0.0.1:3308/novamall_test' CI=true pnpm test:integration
```

## 8. 当前限制

- 退款 API 仅保留数据库专项测试路径，不属于当前浏览器演示主线；
- 管理员用户禁用/启用接口未作为当前已暴露 API 演示；
- 索引和全文检索性能结论已写入证据文件，引用时需保留数据规模和本地环境限制；
- 性能证据来自 Stage 6 确定性数据集和本地 MySQL 环境，不能外推为生产性能承诺。
