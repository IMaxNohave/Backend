CREATE TABLE `order_chat_state` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`last_read_message_id` varchar(36),
	`last_read_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `order_chat_state_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `order_chat_state` ADD CONSTRAINT `order_chat_state_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_chat_state` ADD CONSTRAINT `order_chat_state_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_chat_state` ADD CONSTRAINT `order_chat_state_last_read_message_id_order_message_id_fk` FOREIGN KEY (`last_read_message_id`) REFERENCES `order_message`(`id`) ON DELETE cascade ON UPDATE no action;