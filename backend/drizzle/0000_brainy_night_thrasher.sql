CREATE TABLE `batches` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`sender_id` varchar(36) NOT NULL,
	`subject` varchar(500) NOT NULL,
	`body` longtext NOT NULL,
	`start_time` datetime(3) NOT NULL,
	`delay_seconds` int NOT NULL DEFAULT 0,
	`hourly_limit` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `emails` (
	`id` varchar(36) NOT NULL,
	`batch_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`sender_id` varchar(36) NOT NULL,
	`seq` int NOT NULL,
	`to_email` varchar(320) NOT NULL,
	`scheduled_at` datetime(3) NOT NULL,
	`sent_at` datetime(3),
	`status` enum('scheduled','sending','sent','failed') NOT NULL DEFAULT 'scheduled',
	`attempts` int NOT NULL DEFAULT 0,
	`error` text,
	`message_id` varchar(255),
	`preview_url` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `emails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `senders` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`smtp_host` varchar(255) NOT NULL,
	`smtp_port` int NOT NULL,
	`smtp_user` varchar(255) NOT NULL,
	`smtp_pass` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `senders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`avatar_url` text,
	`google_id` varchar(64),
	`password_hash` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `users_google_id_unique` UNIQUE(`google_id`)
);
--> statement-breakpoint
ALTER TABLE `batches` ADD CONSTRAINT `batches_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `batches` ADD CONSTRAINT `batches_sender_id_senders_id_fk` FOREIGN KEY (`sender_id`) REFERENCES `senders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `emails` ADD CONSTRAINT `emails_batch_id_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `emails` ADD CONSTRAINT `emails_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `emails` ADD CONSTRAINT `emails_sender_id_senders_id_fk` FOREIGN KEY (`sender_id`) REFERENCES `senders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `senders` ADD CONSTRAINT `senders_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `emails_user_status_idx` ON `emails` (`user_id`,`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `emails_status_idx` ON `emails` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `emails_batch_idx` ON `emails` (`batch_id`);--> statement-breakpoint
CREATE INDEX `senders_user_idx` ON `senders` (`user_id`);