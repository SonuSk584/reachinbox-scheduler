CREATE TABLE `slack_connections` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`team_id` varchar(64),
	`team_name` varchar(255),
	`channel_id` varchar(64),
	`channel` varchar(255),
	`webhook_url` varchar(500) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `slack_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `slack_connections_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `slack_connections` ADD CONSTRAINT `slack_connections_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;