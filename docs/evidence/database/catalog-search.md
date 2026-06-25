# 商品目录索引与全文检索初步证据

## 环境

- 数据库：MySQL 8.4.9
- 数据来源：本地 Docker Compose 开发库，经过 Stage 3 E2E 创建分类和商品
- 采集时间：2026-06-24

## 数据规模

```sql
SELECT VERSION() AS mysql_version;
SELECT COUNT(*) AS categories FROM categories;
SELECT COUNT(*) AS shops FROM shops;
SELECT COUNT(*) AS products FROM products;
```

结果：

```text
mysql_version: 8.4.9
categories: 7
shops: 6
products: 3
```

当前数据规模只适合验证 SQL 可执行、索引存在和查询路径，不足以得出稳定性能提升结论。

## 分类筛选

SQL：

```sql
EXPLAIN ANALYZE
SELECT p.id, p.name, p.price
FROM products p
JOIN categories c ON c.id = p.category_id
JOIN shops s ON s.id = p.shop_id
WHERE p.status = 'PUBLISHED'
  AND c.status = 'ACTIVE'
  AND s.status = 'ACTIVE'
  AND p.category_id = 7
ORDER BY p.created_at DESC, p.id DESC
LIMIT 20;
```

观察结果摘要：

```text
Index lookup on p using idx_products_category_status_id (category_id=7, status='PUBLISHED')
actual time=0.0135..0.0144 rows=1
```

结论：分类筛选命中了 `idx_products_category_status_id`，符合 Stage 3 公开分类分页查询的索引设计。

## 中文 FULLTEXT 查询

SQL：

```sql
EXPLAIN ANALYZE
SELECT p.id, p.name, p.price
FROM products p
JOIN categories c ON c.id = p.category_id
JOIN shops s ON s.id = p.shop_id
WHERE p.status = 'PUBLISHED'
  AND c.status = 'ACTIVE'
  AND s.status = 'ACTIVE'
  AND MATCH(p.name, p.description) AGAINST ('苹果' IN NATURAL LANGUAGE MODE)
ORDER BY MATCH(p.name, p.description) AGAINST ('苹果' IN NATURAL LANGUAGE MODE) DESC, p.id DESC
LIMIT 20;
```

观察结果摘要：

```text
Filter: (match p.`name`,p.`description` against ('苹果'))
Index lookup on p using idx_products_status_updated (status='PUBLISHED')
actual time=0.00558..0.00662 rows=1
```

结论：SQL 使用了 `MATCH ... AGAINST` 并能返回中文关键词结果。在当前极小数据集下，优化器选择先使用 `idx_products_status_updated` 过滤上架状态，再执行全文匹配过滤；本次运行不能证明 FULLTEXT 索引的性能优势。

## LIKE 对照

SQL：

```sql
EXPLAIN ANALYZE
SELECT p.id, p.name, p.price
FROM products p
JOIN categories c ON c.id = p.category_id
JOIN shops s ON s.id = p.shop_id
WHERE p.status = 'PUBLISHED'
  AND c.status = 'ACTIVE'
  AND s.status = 'ACTIVE'
  AND (p.name LIKE '%苹果%' OR p.description LIKE '%苹果%')
ORDER BY p.created_at DESC, p.id DESC
LIMIT 20;
```

观察结果摘要：

```text
Filter: ((p.`name` like '%苹果%') or (p.`description` like '%苹果%'))
Index lookup on p using idx_products_status_updated (status='PUBLISHED')
actual time=0.00637..0.00692 rows=1
```

结论：LIKE 对照同样因数据量很小而使用上架状态索引后过滤。后续 Stage 7 需要用更大固定数据集重新采集 FULLTEXT 与 LIKE 的执行计划和计时。

## 限制

- 当前只有 3 条商品，不足以进行性能对比；
- 本次只保存初步可执行证据；
- Stage 7 需要补充数据生成器、多次运行、冷/热缓存说明和完整 `EXPLAIN ANALYZE` 原文。
