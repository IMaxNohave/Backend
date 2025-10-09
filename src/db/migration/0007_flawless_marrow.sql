ALTER TABLE `order_event` DROP FOREIGN KEY `order_event_order_id_item_id_fk`;
--> statement-breakpoint
ALTER TABLE `order_event` ADD CONSTRAINT `order_event_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;