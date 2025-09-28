ALTER TABLE `wallet_tx` DROP FOREIGN KEY `wallet_tx_action_action_type_action_name_fk`;
--> statement-breakpoint
ALTER TABLE `wallet_tx` ADD CONSTRAINT `wallet_tx_action_action_type_id_fk` FOREIGN KEY (`action`) REFERENCES `action_type`(`id`) ON DELETE cascade ON UPDATE no action;