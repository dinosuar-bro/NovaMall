# 高阶数据库技术设计

## 1. 目标与范围

NovaMall 实现 9 项高阶数据库技术。每项技术必须服务于真实业务，并提供 SQL、测试、执行计划或结果证据。数据库目标版本为 MySQL 8.4 LTS；实现前仍需以实际 Docker 镜像版本验证语法。

## 2. 技术一：存储过程

### 业务场景

统一购物车结算需要同时完成库存锁定、总订单创建、履约子订单创建、订单快照、库存扣减、支付记录创建和购物车清理。

### 接口

```sql
CALL sp_checkout_cart(
  IN  p_user_id,
  IN  p_address_id,
  IN  p_checkout_token,
  OUT p_order_no
);
```

该过程同时具备输入和输出参数，满足课程要求。

### 核心算法

1. 检查相同 `user_id + checkout_token` 是否已有订单；有则返回原订单号。
2. 开启 READ COMMITTED 事务。
3. 校验地址属于当前会员，购物车不为空。
4. 将购物车商品按 `product_id` 升序锁定：`SELECT ... FOR UPDATE`。
5. 校验商品上架、分类正常、数量合法且库存充足。
6. 以数据库当前价格计算金额，不信任客户端金额。
7. 创建总订单和履约子订单。
8. 创建订单明细快照，扣减库存，创建待支付记录，清空购物车。
9. 提交事务并通过 OUT 参数返回订单号。
10. `EXIT HANDLER FOR SQLEXCEPTION` 执行回滚并重新抛出异常。

### 业务错误

使用 `SIGNAL SQLSTATE '45000'` 返回稳定错误标识，例如：

- `EMPTY_CART`；
- `ADDRESS_NOT_OWNED`；
- `PRODUCT_UNAVAILABLE`；
- `OUT_OF_STOCK`。

应用层只映射白名单错误，不将原始 SQL 信息返回客户端。

## 3. 技术二：触发器

### 价格变更历史

`AFTER UPDATE ON products` 在 `OLD.price <> NEW.price` 时写入 `product_price_history`。

### 关键审计

以下变更通过专用触发器写入 `audit_logs`：

- 商品价格、库存和状态变化；
- 开店申请状态变化；
- 店铺状态变化；
- 总订单和子订单状态变化；
- 用户角色授予和撤销。

Express 在执行写操作前，通过同一数据库连接设置：

```sql
SET @app_actor_user_id = ?;
SET @app_request_id = ?;
```

触发器读取连接级变量写入操作者和请求编号。连接归还池前必须清空变量，防止复用连接串联错误身份。

### 约束

- 触发器只做短小、确定性的历史和审计写入；
- 不在触发器中发送网络请求或实现完整订单流程；
- 审计 JSON 明确排除密码哈希、密钥和手机号明文。

## 4. 技术三：视图

### v_member_order_details

封装总订单、子订单和订单明细的常用关联，为会员订单列表和管理员只读查询提供统一字段。API 仍必须按 `buyer_user_id` 过滤。

### v_effective_product_sales

按商品汇总有效销量和销售额，只统计 `PENDING_SHIPMENT`、`SHIPPED`、`COMPLETED` 等有效成交状态，排除取消和已退款。

### v_shop_sales_summary

保留历史命名，按日期汇总有效订单数、商品数量和销售额，供店主经营概览使用。

视图不包含手机号解密表达式，避免无意扩大敏感数据暴露面。

## 5. 技术四：索引优化

### 计划索引

| 表 | 索引 | 支撑查询 |
|---|---|---|
| users | UQ(username) | 登录 |
| shops | UQ(owner_user_id), UQ(name) | 店主资料归属、名称唯一 |
| products | (category_id, status, id) | 分类商品分页 |
| products | (status, updated_at, id) | 共享商品管理 |
| products | FULLTEXT(name, description) WITH PARSER ngram | 中文全文检索 |
| cart_items | UQ(user_id, product_id) | 购物车查询与原子增加 |
| master_orders | UQ(checkout_token), (buyer_user_id, created_at, id) | 幂等结算、会员订单分页 |
| shop_orders | (status, updated_at, id) | 履约订单分页 |
| order_items | (shop_order_id), (product_id, shop_order_id) | 订单明细、销量统计 |
| refund_requests | UQ(shop_order_id), (status, created_at) | 退款幂等和待审核列表 |
| audit_logs | (created_at, id), (actor_user_id, created_at) | 审计时间线和操作者查询 |

### 对比方法

- 使用固定数据库版本和固定数据集；
- 保存无索引和有索引时的 `EXPLAIN ANALYZE`；
- 记录访问行数、实际执行时间和所选索引；
- 每条查询多次执行，区分首次和预热后结果；
- 报告真实数据，不预设“提升百分比”。

## 6. 技术五：事务与并发控制

### 事务场景

- 开店审核：申请、店铺和 OWNER 角色同时成功或回滚；
- 统一结算：订单、库存、支付和购物车原子变更；
- 模拟支付：支付记录、总订单和全部子订单原子变更；
- 取消订单：状态和库存恢复原子变更；
- 退款批准：退款、订单聚合状态和库存恢复原子变更。

### 隔离级别

关键写事务使用 READ COMMITTED，并通过明确的 `SELECT ... FOR UPDATE` 锁定目标行。READ COMMITTED 每次一致性读使用较新的快照；库存正确性不依赖快照，而依赖锁定读和条件更新。

### 死锁控制

- 多商品库存始终按 `product_id` 升序加锁；
- 事务尽量短，不在事务内执行文件和网络操作；
- 捕获死锁和锁等待超时；仅在确认事务已回滚且请求有幂等令牌时有限重试；
- 记录重试次数和 requestId。

MySQL 官方指出，普通 SELECT 在“先读后写”场景不足以保护相关数据，应使用锁定读。参考：[InnoDB Locking Reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)。

## 7. 技术六：窗口函数

Top 10 使用有效销量视图和 `ROW_NUMBER()`：

```sql
SELECT product_id, product_name, sold_quantity, sales_amount
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

`v_effective_product_sales` 为前端输出将 `product_id` 转为字符型，因此窗口函数中显式转回无符号整数作为末级排序；销量相同时先按销售额降序，再按商品 ID 数值升序稳定输出。MySQL 窗口函数语义参考：[Window Functions](https://dev.mysql.com/doc/refman/8.4/en/window-functions.html)。

## 8. 技术七：审计日志

`audit_logs` 记录：

- 操作者用户 ID；
- API 请求编号；
- 表名和记录 ID；
- 操作类型；
- 脱敏的新旧 JSON；
- 数据库发生时间。

日志只追加，普通应用账号不提供 UPDATE/DELETE 审计日志的接口。管理员只能查询。审计日志用于回答“谁在何时修改了什么”，不代替业务历史表。

## 9. 技术八：全文检索

商品名称和简介以 `utf8mb4` 保存，并创建中文 ngram FULLTEXT 索引：

```sql
CREATE FULLTEXT INDEX ft_products_name_description
ON products(name, description) WITH PARSER ngram;
```

查询使用与索引完全相同的列组合：

```sql
MATCH(name, description) AGAINST (? IN NATURAL LANGUAGE MODE)
```

分类、店铺状态和商品上架状态作为额外过滤条件。MySQL 默认全文解析器不适合无空格的中文，官方提供 ngram 解析器支持 CJK：[ngram Full-Text Parser](https://dev.mysql.com/doc/refman/8.4/en/fulltext-search-ngram.html)。

实验将与 `LIKE '%关键词%'` 在相同数据集上比较执行计划和计时，同时验证两者结果语义并非完全等价。

## 10. 技术九：AES 数据加密

### 加密对象

只加密会员手机号；地址保持明文。密码使用不可逆密码哈希，不使用 AES。

### 存储方式

- `phone_cipher VARBINARY(255)` 保存二进制密文；
- `phone_iv BINARY(16)` 保存每条记录独立随机 IV；
- 订单复制手机号密文和 IV 快照，不保存明文。

### 加解密策略

- 数据库连接会话设置 `block_encryption_mode = 'aes-256-cbc'`；
- 密钥来自后端容器 Secret/环境变量，不写入 SQL、日志和仓库；
- IV 由密码学安全随机源生成；
- 使用 `AES_ENCRYPT(plain, key, iv)` 和 `AES_DECRYPT(cipher, key, iv)`；
- 解密只发生在明确授权的会员资料和履约查询中；
- 数据库连接应使用受控网络，生产环境启用 TLS。

MySQL 默认模式是 ECB，不使用 IV，因此本项目明确改为带 IV 的 CBC 模式。官方函数说明：[Encryption and Compression Functions](https://dev.mysql.com/doc/refman/8.4/en/encryption-functions.html)。

### 安全边界

该方案用于课程中的数据库加密演示。CBC 提供机密性但不原生提供消息认证；如扩展为生产系统，应优先评估应用层 AEAD（例如 AES-GCM）和专业密钥管理服务。

## 11. 未选择的技术

- 分区表：当前数据规模不足，且会增加外键和维护复杂度；
- 数据库用户权限：应用仍遵循最小权限，但不作为本次计分演示项；
- 备份恢复：部署文档提供策略说明，但不作为本次 9 项核心验收。
