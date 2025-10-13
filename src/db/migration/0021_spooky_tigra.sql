CREATE TABLE `dispute_settlement` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`dispute_id` varchar(36),
	`seller_pct` int NOT NULL,
	`seller_amount` decimal(12,2) NOT NULL,
	`buyer_amount` decimal(12,2) NOT NULL,
	`fee_amount` decimal(12,2) NOT NULL DEFAULT '0',
	`note` text,
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dispute_settlement_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `dispute_settlement` ADD CONSTRAINT `dispute_settlement_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispute_settlement` ADD CONSTRAINT `dispute_settlement_dispute_id_dispute_id_fk` FOREIGN KEY (`dispute_id`) REFERENCES `dispute`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispute_settlement` ADD CONSTRAINT `dispute_settlement_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;