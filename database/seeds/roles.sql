INSERT INTO roles (id, code, name) VALUES
  (1, 'MEMBER', '会员'),
  (2, 'OWNER', '店主'),
  (3, 'ADMIN', '管理员')
ON DUPLICATE KEY UPDATE
  code = VALUES(code),
  name = VALUES(name);
