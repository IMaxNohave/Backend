CREATE TABLE `wallet_hold` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`status` int NOT NULL DEFAULT 1,
	`amount` decimal(12,2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallet_hold_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user` ADD `user_type` int NOT NULL;--> statement-breakpoint
ALTER TABLE `wallet_tx` ADD `hold_id` varchar(32);--> statement-breakpoint
ALTER TABLE `wallet_hold` ADD CONSTRAINT `wallet_hold_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_hold` ADD CONSTRAINT `wallet_hold_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_tx` ADD CONSTRAINT `wallet_tx_hold_id_wallet_hold_id_fk` FOREIGN KEY (`hold_id`) REFERENCES `wallet_hold`(`id`) ON DELETE cascade ON UPDATE no action;