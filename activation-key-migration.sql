-- Add activation keys to an existing IMS installation.
ALTER TABLE `ims_clients`
  ADD COLUMN IF NOT EXISTS `activation_key` VARCHAR(64) NULL UNIQUE;
