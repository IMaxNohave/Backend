CREATE TABLE `order_event` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`actor_id` varchar(36) NOT NULL,
	`quantity` int NOT NULL,
	`type` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_event_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `order_event` ADD CONSTRAINT `order_event_order_id_item_id_fk` FOREIGN KEY (`order_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_event` ADD CONSTRAINT `order_event_actor_id_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;