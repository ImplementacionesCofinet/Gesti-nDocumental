CREATE TABLE `ingestion_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`attachment_id` text NOT NULL,
	`mailbox` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`received_at` text NOT NULL,
	`attachment_name` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`error_message` text,
	`invoice_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ingestion_messages_message_attachment` ON `ingestion_messages` (`message_id`,`attachment_id`);--> statement-breakpoint
CREATE INDEX `idx_ingestion_messages_status` ON `ingestion_messages` (`status`);--> statement-breakpoint
CREATE TABLE `invoice_files` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`filename` text NOT NULL,
	`file_kind` text NOT NULL,
	`content_type` text NOT NULL,
	`object_key` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoice_records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_invoice_files_invoice_filename` ON `invoice_files` (`invoice_id`,`filename`);--> statement-breakpoint
CREATE INDEX `idx_invoice_files_invoice_id` ON `invoice_files` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoice_records` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`number` text NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`folio` text NOT NULL,
	`supplier` text NOT NULL,
	`supplier_nit` text DEFAULT '' NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`due_date` text,
	`due_source` text DEFAULT 'No registrada' NOT NULL,
	`received_at` text NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`cost_center` text DEFAULT '' NOT NULL,
	`recipient_name` text NOT NULL,
	`recipient_nit` text NOT NULL,
	`stage` text DEFAULT 'Nueva' NOT NULL,
	`current_role` text DEFAULT 'Radicador' NOT NULL,
	`assigned_to` text,
	`payment_term` text,
	`description` text DEFAULT '' NOT NULL,
	`cufe` text,
	`history` text DEFAULT '[]' NOT NULL,
	`mailbox` text NOT NULL,
	`source_message_id` text NOT NULL,
	`source_attachment_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_invoice_records_source_key` ON `invoice_records` (`source_key`);--> statement-breakpoint
CREATE INDEX `idx_invoice_records_current_role` ON `invoice_records` (`current_role`);--> statement-breakpoint
CREATE INDEX `idx_invoice_records_due_date` ON `invoice_records` (`due_date`);