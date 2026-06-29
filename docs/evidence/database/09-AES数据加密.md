# AES 数据加密证据

## 目标

验证手机号以 AES 密文和独立 IV 存储，并确认授权解密、错误密钥和订单快照行为。

## 已知实现

- `users.phone_cipher` / `users.phone_iv`
- `addresses.receiver_phone_cipher` / `addresses.receiver_phone_iv`
- `master_orders.receiver_phone_cipher` / `master_orders.receiver_phone_iv`
- 密码使用不可逆哈希，不使用 AES。

## 复现 SQL

```sql
SET @evidence_key = REPEAT('k', 32);

SELECT id, username,
       HEX(phone_cipher) AS phone_cipher_hex,
       HEX(phone_iv) AS phone_iv_hex
FROM users
WHERE id = 155;

SELECT CAST(AES_DECRYPT(phone_cipher, @evidence_key, phone_iv) AS CHAR CHARACTER SET utf8mb4) AS decrypted_phone
FROM users
WHERE id = 155;

SELECT CAST(AES_DECRYPT(phone_cipher, REPEAT('x', 32), phone_iv) AS CHAR CHARACTER SET utf8mb4) AS wrong_key_phone
FROM users
WHERE id = 155;

SELECT order_no,
       HEX(receiver_phone_cipher) AS receiver_phone_cipher_hex,
       HEX(receiver_phone_iv) AS receiver_phone_iv_hex
FROM master_orders
WHERE buyer_user_id = 155
ORDER BY id DESC
LIMIT 1;
```

## 当前状态

正式 AES 证据必须在 `aes-256-cbc` 会话中采集。应用连接池会在新连接时执行：

```sql
SET SESSION block_encryption_mode = 'aes-256-cbc'
```

集成测试 `health-ready.test.ts` 已断言连接模式为 `aes-256-cbc`。

直接使用 `mysql` CLI 时默认会话变量为 `aes-128-ecb`。本轮排障确认，在该默认模式下 IV 会被忽略，错误 key 样本没有验证意义。因此正式样本改用显式 CBC 会话。

## 正式 CBC 样本输出

```text
cbc_user_id  cbc_address_id  cbc_order_no
156          12              MOa71859d7732911f193440afda4b47e66

id   username                         phone_cipher_hex                  phone_iv_hex
156  stage6_cbc_20260629034335938000  D800B475039110A3CE67F053FE24BD63  A50B443DBE398A7C452F9C3E14EA2A19

decrypted_phone
13900000002

wrong_key_phone
NULL

order_no                              receiver_phone_cipher_hex          receiver_phone_iv_hex
MOa71859d7732911f193440afda4b47e66    386B420436C1C2476CD87625E98F5A3E   E90E143C46E06B6A66EF2CE46921AB21
```

结论：

- 直接查询只能看到密文和 IV；
- 正确 key 能授权解密；
- 错误 key 返回 `NULL`，不能得到有效手机号；
- 订单快照保存的是收件手机号密文和 IV，不保存手机号明文；
- 使用数据库 CLI 做证据采集时必须显式设置 `block_encryption_mode = 'aes-256-cbc'`，否则会话默认值可能破坏验证语义。

## 安全边界

该方案用于课程中的数据库加密演示。AES-CBC 提供机密性但不提供消息认证；若扩展为生产系统，应优先评估应用层 AEAD 和专业密钥管理。
