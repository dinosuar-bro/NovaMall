-- migrate:up

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  phone_cipher VARBINARY(255) NOT NULL,
  phone_iv BINARY(16) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE roles (
  id TINYINT UNSIGNED NOT NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(50) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code),
  UNIQUE KEY uq_roles_name (name),
  CONSTRAINT chk_roles_code CHECK (code IN ('MEMBER', 'OWNER', 'ADMIN'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO roles (id, code, name) VALUES
  (1, 'MEMBER', '会员'),
  (2, 'OWNER', '店主'),
  (3, 'ADMIN', '管理员');

CREATE TABLE user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id TINYINT UNSIGNED NOT NULL,
  granted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  granted_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role_user (role_id, user_id),
  KEY idx_user_roles_granted_by (granted_by),
  CONSTRAINT fk_user_roles_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_user_roles_role
    FOREIGN KEY (role_id) REFERENCES roles (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_user_roles_granted_by
    FOREIGN KEY (granted_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sessions (
  session_id VARCHAR(128) NOT NULL,
  expires BIGINT UNSIGNED NOT NULL,
  data MEDIUMTEXT NOT NULL,
  PRIMARY KEY (session_id),
  KEY idx_sessions_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down

DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;
