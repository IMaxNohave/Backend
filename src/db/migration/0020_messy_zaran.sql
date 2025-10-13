ALTER TABLE `dispute` ADD `payout_buyer` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `dispute` ADD `payout_seller` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `dispute` ADD `resolution_type` text DEFAULT ('MANUAL') NOT NULL;--> statement-breakpoint
ALTER TABLE `dispute` ADD `resolution_note` text;