ALTER TABLE `orders` MODIFY COLUMN `quantity` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `status` text NOT NULL DEFAULT ('ESCROW_HELD');--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `cancelled_by` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `trade_deadline_at` timestamp(3);