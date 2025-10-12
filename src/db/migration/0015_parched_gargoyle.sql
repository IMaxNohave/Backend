ALTER TABLE `wallet_tx` DROP FOREIGN KEY `wallet_tx_hold_id_wallet_hold_id_fk`;
--> statement-breakpoint
ALTER TABLE `wallet_tx` DROP COLUMN `hold_id`;