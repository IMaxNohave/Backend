ALTER TABLE `order_event` ADD `message` text NOT NULL;--> statement-breakpoint
ALTER TABLE `order_event` DROP COLUMN `quantity`;