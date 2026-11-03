-- IMS: product control + client/device locations
-- Safe to run more than once (MariaDB / MySQL 8).

-- Where each client's business is. Set by IMS staff (typed address -> pin).
ALTER TABLE ims_clients
  ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7) NULL,
  ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7) NULL,
  ADD COLUMN IF NOT EXISTS geo_source VARCHAR(12) NULL,
  ADD COLUMN IF NOT EXISTS tracking_consent TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_km SMALLINT NOT NULL DEFAULT 2;

-- Where each device is. Written by the product itself.
ALTER TABLE ims_devices
  ADD COLUMN IF NOT EXISTS product_id INT NULL,
  ADD COLUMN IF NOT EXISTS last_lat DECIMAL(10,7) NULL,
  ADD COLUMN IF NOT EXISTS last_lng DECIMAL(10,7) NULL,
  ADD COLUMN IF NOT EXISTS last_accuracy INT NULL,
  ADD COLUMN IF NOT EXISTS last_loc_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS last_loc_source VARCHAR(12) NULL,
  ADD COLUMN IF NOT EXISTS battery TINYINT NULL,
  ADD COLUMN IF NOT EXISTS app_version VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS lost_mode TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lost_note VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS lost_at DATETIME NULL;

-- Trail of past positions (one row per meaningful move)
CREATE TABLE IF NOT EXISTS ims_device_locations (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id  INT NOT NULL,
  lat        DECIMAL(10,7) NOT NULL,
  lng        DECIMAL(10,7) NOT NULL,
  accuracy   INT NULL,
  source     VARCHAR(12) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dev_time (device_id, created_at),
  FOREIGN KEY (device_id) REFERENCES ims_devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- What kind of thing a product is (an app, a client website, an API ...)
ALTER TABLE ims_products
  ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'app';

-- One row per place a product is running for a client (a website, a hosted app ...)
CREATE TABLE IF NOT EXISTS ims_deployments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  client_id     INT NOT NULL,
  product_id    INT NOT NULL,
  name          VARCHAR(150) NOT NULL,
  url           VARCHAR(255) NULL,
  token         VARCHAR(40) NOT NULL UNIQUE,
  status        VARCHAR(10) NOT NULL DEFAULT 'live',   -- live | paused
  version       VARCHAR(20) NULL,
  last_seen     DATETIME NULL,
  last_check    DATETIME NULL,
  last_http     SMALLINT NULL,
  last_ms       INT NULL,
  pause_message VARCHAR(255) NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id)  REFERENCES ims_clients(id)  ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES ims_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
