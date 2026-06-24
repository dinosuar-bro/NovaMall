-- migrate:up

CREATE TABLE merchant_applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  shop_name VARCHAR(100) NOT NULL,
  shop_description VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL,
  reject_reason VARCHAR(500) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(3) NULL,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_merchant_applications_user (user_id),
  KEY idx_merchant_applications_status_submitted (status, submitted_at, id),
  KEY idx_merchant_applications_reviewed_by (reviewed_by),
  CONSTRAINT fk_merchant_applications_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_merchant_applications_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_merchant_applications_status
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT chk_merchant_applications_shop_name_non_empty
    CHECK (CHAR_LENGTH(TRIM(shop_name)) > 0),
  CONSTRAINT chk_merchant_applications_description_non_empty
    CHECK (CHAR_LENGTH(TRIM(shop_description)) > 0),
  CONSTRAINT chk_merchant_applications_reject_reason
    CHECK (
      (status = 'REJECTED' AND reject_reason IS NOT NULL AND CHAR_LENGTH(TRIM(reject_reason)) > 0)
      OR (status <> 'REJECTED' AND reject_reason IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE shops (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  logo_path VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_shops_owner_user (owner_user_id),
  UNIQUE KEY uq_shops_name (name),
  CONSTRAINT fk_shops_owner_user
    FOREIGN KEY (owner_user_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_shops_status CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  CONSTRAINT chk_shops_name_non_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_shops_description_non_empty CHECK (CHAR_LENGTH(TRIM(description)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  request_id CHAR(36) NULL,
  table_name VARCHAR(64) NOT NULL,
  record_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(30) NOT NULL,
  old_data JSON NULL,
  new_data JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_logs_created_id (created_at, id),
  KEY idx_audit_logs_actor_created (actor_user_id, created_at),
  KEY idx_audit_logs_table_record (table_name, record_id),
  CONSTRAINT fk_audit_logs_actor
    FOREIGN KEY (actor_user_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT chk_audit_logs_action
    CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'STATUS_CHANGE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_merchant_applications_status_audit
AFTER UPDATE ON merchant_applications
FOR EACH ROW
  INSERT INTO audit_logs (
    actor_user_id,
    request_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data
  )
  SELECT
    CAST(NULLIF(@novamall_actor_user_id, '') AS UNSIGNED),
    NULLIF(CAST(@novamall_request_id AS CHAR(36)), ''),
    'merchant_applications',
    NEW.id,
    'STATUS_CHANGE',
    JSON_OBJECT(
      'status', OLD.status,
      'rejectReason', OLD.reject_reason,
      'reviewedBy', CAST(OLD.reviewed_by AS CHAR),
      'reviewedAt', DATE_FORMAT(OLD.reviewed_at, '%Y-%m-%dT%H:%i:%s.%fZ'),
      'shopName', OLD.shop_name
    ),
    JSON_OBJECT(
      'status', NEW.status,
      'rejectReason', NEW.reject_reason,
      'reviewedBy', CAST(NEW.reviewed_by AS CHAR),
      'reviewedAt', DATE_FORMAT(NEW.reviewed_at, '%Y-%m-%dT%H:%i:%s.%fZ'),
      'shopName', NEW.shop_name
    )
  WHERE OLD.status <> NEW.status;

-- migrate:down

DROP TRIGGER IF EXISTS trg_merchant_applications_status_audit;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS shops;
DROP TABLE IF EXISTS merchant_applications;
