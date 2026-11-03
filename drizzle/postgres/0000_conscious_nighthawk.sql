CREATE TABLE "ingestion_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"mailbox" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"received_at" text NOT NULL,
	"attachment_name" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"error_message" text,
	"invoice_id" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_files" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"filename" text NOT NULL,
	"file_kind" text NOT NULL,
	"content_type" text NOT NULL,
	"object_key" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_records" (
	"id" text PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"number" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"folio" text NOT NULL,
	"supplier" text NOT NULL,
	"supplier_nit" text DEFAULT '' NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"due_date" text,
	"due_source" text DEFAULT 'No registrada' NOT NULL,
	"received_at" text NOT NULL,
	"area" text DEFAULT '' NOT NULL,
	"cost_center" text DEFAULT '' NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_nit" text NOT NULL,
	"stage" text DEFAULT 'Nueva' NOT NULL,
	"current_role" text DEFAULT 'Radicador' NOT NULL,
	"assigned_to" text,
	"payment_term" text,
	"document_type" text DEFAULT 'Factura electrónica' NOT NULL,
	"source_subject" text DEFAULT '' NOT NULL,
	"document_reference" text,
	"routing_hint" text DEFAULT 'CXP' NOT NULL,
	"related_document_reference" text,
	"document_reason" text,
	"description" text DEFAULT '' NOT NULL,
	"cufe" text,
	"history" text DEFAULT '[]' NOT NULL,
	"mailbox" text NOT NULL,
	"source_message_id" text NOT NULL,
	"source_attachment_id" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_files" ADD CONSTRAINT "invoice_files_invoice_id_invoice_records_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ingestion_messages_message_attachment" ON "ingestion_messages" USING btree ("message_id","attachment_id");--> statement-breakpoint
CREATE INDEX "idx_ingestion_messages_status" ON "ingestion_messages" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invoice_files_invoice_filename" ON "invoice_files" USING btree ("invoice_id","filename");--> statement-breakpoint
CREATE INDEX "idx_invoice_files_invoice_id" ON "invoice_files" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invoice_records_source_key" ON "invoice_records" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "idx_invoice_records_current_role" ON "invoice_records" USING btree ("current_role");--> statement-breakpoint
CREATE INDEX "idx_invoice_records_due_date" ON "invoice_records" USING btree ("due_date");