CREATE TABLE `notification` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`type` varchar(32) NOT NULL,
	`title` varchar(255),
	`body` text,
	`order_id` varchar(36),
	`data` json,
	`is_read` boolean NOT NULL DEFAULT false,
	`read_at` timestamp(3),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `item` MODIFY COLUMN `expires_at` timestamp;--> statement-breakpoint
ALTER TABLE `notification` ADD CONSTRAINT `notification_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification` ADD CONSTRAINT `notification_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;