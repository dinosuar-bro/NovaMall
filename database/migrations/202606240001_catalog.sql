-- migrate:up

CREATE TABLE categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name),
  KEY idx_categories_status_name (status, name, id),
  CONSTRAINT chk_categories_status CHECK (status IN ('ACTIVE', 'DISABLED')),
  CONSTRAINT chk_categories_name_non_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_categories_description_non_empty CHECK (CHAR_LENGTH(TRIM(description)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  main_image_path VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_products_category_status_id (category_id, status, id),
  KEY idx_products_shop_status_updated (shop_id, status, updated_at, id),
  KEY idx_products_status_updated (status, updated_at, id),
  FULLTEXT KEY ft_products_name_description (name, description) WITH PARSER ngram,
  CONSTRAINT fk_products_shop
    FOREIGN KEY (shop_id) REFERENCES shops (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_products_category
    FOREIGN KEY (category_id) REFERENCES categories (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_products_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED')),
  CONSTRAINT chk_products_name_non_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_products_description_non_empty CHECK (CHAR_LENGTH(TRIM(description)) > 0),
  CONSTRAINT chk_products_price_positive CHECK (price > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_price_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  old_price DECIMAL(10, 2) NOT NULL,
  new_price DECIMAL(10, 2) NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  request_id CHAR(36) NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_product_price_history_product_changed (product_id, changed_at, id),
  CONSTRAINT fk_product_price_history_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_product_price_history_changed_by
    FOREIGN KEY (changed_by) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_products_price_history
AFTER UPDATE ON products
FOR EACH ROW
  INSERT INTO product_price_history (
    product_id,
    old_price,
    new_price,
    changed_by,
    request_id
  )
  SELECT
    NEW.id,
    OLD.price,
    NEW.price,
    CAST(NULLIF(@novamall_actor_user_id, '') AS UNSIGNED),
    NULLIF(CAST(@novamall_request_id AS CHAR(36)), '')
  WHERE OLD.price <> NEW.price;

CREATE TRIGGER trg_products_audit
AFTER UPDATE ON products
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
    'products',
    NEW.id,
    'UPDATE',
    JSON_OBJECT(
      'price', CAST(OLD.price AS CHAR),
      'stock', OLD.stock,
      'status', OLD.status,
      'categoryId', CAST(OLD.category_id AS CHAR),
      'name', OLD.name,
      'mainImagePath', OLD.main_image_path
    ),
    JSON_OBJECT(
      'price', CAST(NEW.price AS CHAR),
      'stock', NEW.stock,
      'status', NEW.status,
      'categoryId', CAST(NEW.category_id AS CHAR),
      'name', NEW.name,
      'mainImagePath', NEW.main_image_path
    )
  WHERE OLD.price <> NEW.price
     OR OLD.stock <> NEW.stock
     OR OLD.status <> NEW.status
     OR OLD.category_id <> NEW.category_id
     OR OLD.name <> NEW.name
     OR NOT (OLD.main_image_path <=> NEW.main_image_path);

-- migrate:down

DROP TRIGGER IF EXISTS trg_products_audit;
DROP TRIGGER IF EXISTS trg_products_price_history;
DROP TABLE IF EXISTS product_price_history;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
