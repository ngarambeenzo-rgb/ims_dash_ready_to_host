-- ============================================================
--  IMS — Instance Management System
--  Database Schema v1.0
--  Run this ONCE in phpMyAdmin on your ims_db database
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ── ADMINS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ims_admins` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `full_name`      VARCHAR(100) NOT NULL,
  `username`       VARCHAR(50) NOT NULL UNIQUE,
  `password`       VARCHAR(255) NOT NULL,
  `active`         TINYINT(1) NOT NULL DEFAULT 1,
  `last_login`     TIMESTAMP NULL,
  `login_attempts` INT NOT NULL DEFAULT 0,
  `created_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default admin: username=admin, password=password  (change it right after the first sign-in)
INSERT IGNORE INTO `ims_admins` (`full_name`, `username`, `password`) VALUES
('IMS Admin', 'admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');

-- ── PRODUCTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ims_products` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `name`            VARCHAR(100) NOT NULL,
  `icon`            VARCHAR(10) DEFAULT '📦',
  `description`     VARCHAR(255),
  `current_version` VARCHAR(20) DEFAULT '1.0.0',
  `active`          TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default product: BarMS Pro
INSERT IGNORE INTO `ims_products` (`id`, `name`, `icon`, `description`, `current_version`) VALUES
(1, 'BarMS Pro', '🍺', 'Bar Management System — Rwanda', '1.0.0');

-- ── SUBSCRIPTION PLANS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ims_subscription_plans` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `name`          VARCHAR(100) NOT NULL,
  `duration_days` INT NOT NULL DEFAULT 30,
  `price_rwf`     DECIMAL(12,2) NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default plans
INSERT IGNORE INTO `ims_subscription_plans` (`id`, `name`, `duration_days`, `price_rwf`) VALUES
(1, 'Trial',   14,  0),
(2, 'Monthly', 30,  15000),
(3, 'Annual',  365, 150000);

-- ── CLIENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ims_clients` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `business_name` VARCHAR(150) NOT NULL,
  `location`      VARCHAR(255),
  `contact_phone` VARCHAR(20),
  `contact_email` VARCHAR(100),
  `activation_key` VARCHAR(64) NULL UNIQUE,
  `product_id`    INT NOT NULL DEFAULT 1,
  `status`        ENUM('active','expired','trial','suspended') DEFAULT 'trial',
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `ims_products`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── SUBSCRIPTIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ims_subscriptions` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `client_id`   INT NOT NULL,
  `plan_id`     INT NOT NULL,
  `max_devices` INT NOT NULL DEFAULT 1,
  `start_date`  DATE NOT NULL,
  `expiry_date` DATE NOT NULL,
  `status`      ENUM('active','expired','trial','suspended') DEFAULT 'trial',
  `created_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`client_id`) REFERENCES `ims_clients`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`plan_id`)   REFERENCES `ims_subscription_plans`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── PAYMENTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ims_payments` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `client_id`        INT NOT NULL,
  `plan_id`          INT NOT NULL,
  `amount`           DECIMAL(12,2) NOT NULL,
  `max_devices`      INT NOT NULL DEFAULT 1,
  `payment_method`   VARCHAR(50) DEFAULT 'Cash',
  `period_start`     DATE NOT NULL,
  `period_end`       DATE NOT NULL,
  `notes`            TEXT,
  `recorded_by`      VARCHAR(100) NOT NULL,
  `created_at`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`client_id`) REFERENCES `ims_clients`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`plan_id`)   REFERENCES `ims_subscription_plans`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── DEVICES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ims_devices` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `client_id`    INT NOT NULL,
  `device_uuid`  VARCHAR(64) NOT NULL UNIQUE,
  `device_name`  VARCHAR(150),
  `device_type`  VARCHAR(50),
  `os`           VARCHAR(50),
  `browser`      VARCHAR(50),
  `status`       ENUM('pending','approved','blocked') DEFAULT 'pending',
  `first_seen`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `last_sync`    TIMESTAMP NULL,
  `last_ip`      VARCHAR(45),
  FOREIGN KEY (`client_id`) REFERENCES `ims_clients`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── LICENSES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ims_licenses` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `client_id`   INT NOT NULL,
  `device_id`   INT,
  `plan_id`     INT NOT NULL,
  `max_devices` INT NOT NULL DEFAULT 1,
  `token`       TEXT NOT NULL,
  `token_hash`  VARCHAR(64) NOT NULL UNIQUE,
  `nonce`       VARCHAR(32) NOT NULL,
  `issued_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `expires_at`  TIMESTAMP NOT NULL,
  `status`      ENUM('active','expired','revoked') DEFAULT 'active',
  `issued_by`   VARCHAR(100) DEFAULT 'system',
  FOREIGN KEY (`client_id`) REFERENCES `ims_clients`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`plan_id`)   REFERENCES `ims_subscription_plans`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── SYNC LOG ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ims_sync_log` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `client_id`        INT NOT NULL,
  `device_id`        INT,
  `records_received` INT DEFAULT 0,
  `license_status`   VARCHAR(20),
  `ip_address`       VARCHAR(45),
  `synced_at`        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`client_id`) REFERENCES `ims_clients`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── AUDIT LOG ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ims_audit_log` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `action_type` VARCHAR(50) NOT NULL,
  `details`     TEXT,
  `done_by`     VARCHAR(100) NOT NULL,
  `created_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── SYSTEM SETTINGS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ims_settings` (
  `key`        VARCHAR(100) PRIMARY KEY,
  `value`      TEXT,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `ims_settings` (`key`, `value`) VALUES
('company_name',      'IMS Company'),
('system_name',       'IMS — Instance Management System'),
('license_duration',  '24'),
('grace_period',      '17'),
('maps_key',          ''),
('keys_generated_at', NULL);

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'IMS database created successfully!' AS status;
