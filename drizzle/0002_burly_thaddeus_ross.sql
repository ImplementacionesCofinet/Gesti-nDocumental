ALTER TABLE `invoice_records` ADD `document_type` text DEFAULT 'Factura electrónica' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_records` ADD `source_subject` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_records` ADD `document_reference` text;--> statement-breakpoint
ALTER TABLE `invoice_records` ADD `routing_hint` text DEFAULT 'CXP' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_records` ADD `related_document_reference` text;--> statement-breakpoint
ALTER TABLE `invoice_records` ADD `document_reason` text;