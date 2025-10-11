DROP TABLE `order_confirm`;--> statement-breakpoint
ALTER TABLE `orders` ADD `seller_accepted_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `orders` ADD `seller_declined_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `orders` ADD `seller_confirmed_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `orders` ADD `buyer_confirmed_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `orders` ADD `cancelled_by` timestamp(3);--> statement-breakpoint
ALTER TABLE `orders` ADD `cancelled_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `orders` ADD `disputed_at` timestamp(3);