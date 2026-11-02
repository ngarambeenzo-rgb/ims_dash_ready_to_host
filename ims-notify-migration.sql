-- ============================================================
--  ims-notify-migration.sql  (safe to run more than once)
--  1. Support messages sent from BarMS by bar owners
--  2. Payment-due alerts emailed to the IMS team
--  3. Email settings (who receives, sending service) — edited in
--     IMS → System Settings → Email & alerts, never in code
-- ============================================================

CREATE TABLE IF NOT EXISTS `ims_support_tickets` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `client_id`     INT NULL,
  `bar_name`      VARCHAR(150) NULL,
  `category`      VARCHAR(30)  NOT NULL DEFAULT 'question',
  `subject`       VARCHAR(150) NOT NULL,
  `message`       TEXT NOT NULL,
  `contact`       VARCHAR(150) NULL,
  `sent_by`       VARCHAR(100) NULL,
  `status`        ENUM('new','in_progress','resolved') NOT NULL DEFAULT 'new',
  `email_status`  ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  `email_error`   VARCHAR(255) NULL,
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_client` (`client_id`), KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- one row per alert sent, so the same subscription is not emailed twice for the same reason
CREATE TABLE IF NOT EXISTS `ims_alert_log` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `subscription_id` INT NOT NULL,
  `client_id`       INT NOT NULL,
  `kind`            VARCHAR(20) NOT NULL,          -- due_soon | due_today | overdue
  `expiry_date`     DATE NOT NULL,
  `sent_to`         VARCHAR(500) NULL,
  `ok`              TINYINT(1) NOT NULL DEFAULT 0,
  `error`           VARCHAR(255) NULL,
  `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_alert` (`subscription_id`, `kind`, `expiry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `ims_settings` (`key`, `value`) VALUES
('support_emails',     ''),     -- receive BarMS help messages (one per line)
('alert_emails',       ''),     -- receive "client must pay" alerts (one per line)
('alert_days_before',  '7'),    -- warn this many days before the subscription ends
('mail_api_key',       ''),     -- Brevo API key (free 300 emails/day) — https://app.brevo.com
('mail_from',          ''),     -- sender address verified in Brevo
('mail_from_name',     'IMS - BarMS'),
('alerts_last_run',    '');
