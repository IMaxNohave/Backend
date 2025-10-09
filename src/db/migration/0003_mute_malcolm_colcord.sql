ALTER TABLE `evidence` RENAME COLUMN `dispute_id` TO `order_id`;--> statement-breakpoint
ALTER TABLE `evidence` DROP FOREIGN KEY `evidence_dispute_id_dispute_id_fk`;
--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;