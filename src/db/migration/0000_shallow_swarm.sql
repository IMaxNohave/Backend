CREATE TABLE `account` (
	`id` varchar(36) NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` timestamp,
	`refresh_token_expires_at` timestamp,
	`scope` text,
	`password` text,
	`created_at` timestamp NOT NULL,
	`updated_at` timestamp NOT NULL,
	CONSTRAINT `account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `action_type` (
	`id` varchar(36) NOT NULL,
	`action_name` varchar(64) NOT NULL,
	CONSTRAINT `action_type_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `category` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`detail` text,
	`is_active` boolean NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `category_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deposit_request` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'THB',
	`provider` varchar(64) NOT NULL,
	`slip_url` text NOT NULL,
	`slip_ref` varchar(128) NOT NULL,
	`status` text NOT NULL DEFAULT ('PENDING'),
	`idempotency_key` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deposit_request_id` PRIMARY KEY(`id`),
	CONSTRAINT `deposit_request_slip_ref_unique` UNIQUE(`slip_ref`)
);
--> statement-breakpoint
CREATE TABLE `dispute` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`opened_by` varchar(36) NOT NULL,
	`reason_code` text NOT NULL,
	`bond_amount` decimal(12,2) NOT NULL DEFAULT '0',
	`status` text NOT NULL DEFAULT ('OPEN'),
	`auto_verdict` text,
	`resolved_by` varchar(36),
	`resolved_at` timestamp(3),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dispute_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` varchar(36) NOT NULL,
	`dispute_id` varchar(36) NOT NULL,
	`by_user_id` varchar(36) NOT NULL,
	`is_video` boolean NOT NULL,
	`url` text NOT NULL,
	`note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item` (
	`id` varchar(36) NOT NULL,
	`seller_id` varchar(36),
	`name` varchar(255) NOT NULL,
	`detail` text,
	`category_id` varchar(36) NOT NULL,
	`image` text,
	`price` decimal(12,2) NOT NULL,
	`quantity` int NOT NULL,
	`is_active` boolean NOT NULL,
	`status` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `item_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jwks` (
	`id` varchar(36) NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text NOT NULL,
	`created_at` timestamp NOT NULL,
	CONSTRAINT `jwks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_confirm` (
	`order_id` varchar(36) NOT NULL,
	`seller_confirmed_at` timestamp(3),
	`buyer_confirmed_at` timestamp(3),
	CONSTRAINT `order_confirm_order_id` PRIMARY KEY(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `order_message` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`sender_id` varchar(36),
	`kind` text NOT NULL,
	`body` text,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`is_hidden` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `order_message_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` varchar(36) NOT NULL,
	`item_id` varchar(36) NOT NULL,
	`seller_id` varchar(36) NOT NULL,
	`buyer_id` varchar(36) NOT NULL,
	`quantity` int NOT NULL,
	`price_at_purchase` decimal(12,2) NOT NULL,
	`total` decimal(12,2) NOT NULL,
	`status` text NOT NULL,
	`deadline_at` timestamp(3) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(36) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`token` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL,
	`updated_at` timestamp NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` varchar(36) NOT NULL,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL,
	`image` text,
	`created_at` timestamp NOT NULL,
	`updated_at` timestamp NOT NULL,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(36) NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp,
	`updated_at` timestamp,
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallet` (
	`user_id` varchar(36) NOT NULL,
	`balance` decimal(14,2) NOT NULL DEFAULT '0',
	`held` decimal(14,2) NOT NULL DEFAULT '0',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallet_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `wallet_tx` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`order_id` varchar(36),
	`action` varchar(32) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wallet_tx_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `withdraw_request` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'THB',
	`method` text NOT NULL DEFAULT ('BANK'),
	`account_info` json NOT NULL,
	`status` text NOT NULL DEFAULT ('PENDING'),
	`failure_code` varchar(64),
	`failure_reason` text,
	`processed_by` varchar(36),
	`processed_at` timestamp(3) DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `withdraw_request_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deposit_request` ADD CONSTRAINT `deposit_request_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispute` ADD CONSTRAINT `dispute_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispute` ADD CONSTRAINT `dispute_opened_by_user_id_fk` FOREIGN KEY (`opened_by`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispute` ADD CONSTRAINT `dispute_resolved_by_user_id_fk` FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_dispute_id_dispute_id_fk` FOREIGN KEY (`dispute_id`) REFERENCES `dispute`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_by_user_id_user_id_fk` FOREIGN KEY (`by_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item` ADD CONSTRAINT `item_seller_id_user_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item` ADD CONSTRAINT `item_category_id_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_confirm` ADD CONSTRAINT `order_confirm_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_message` ADD CONSTRAINT `order_message_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_message` ADD CONSTRAINT `order_message_sender_id_user_id_fk` FOREIGN KEY (`sender_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_seller_id_user_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_buyer_id_user_id_fk` FOREIGN KEY (`buyer_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet` ADD CONSTRAINT `wallet_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_tx` ADD CONSTRAINT `wallet_tx_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_tx` ADD CONSTRAINT `wallet_tx_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_tx` ADD CONSTRAINT `wallet_tx_action_action_type_action_name_fk` FOREIGN KEY (`action`) REFERENCES `action_type`(`action_name`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `withdraw_request` ADD CONSTRAINT `withdraw_request_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `withdraw_request` ADD CONSTRAINT `withdraw_request_processed_by_user_id_fk` FOREIGN KEY (`processed_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;