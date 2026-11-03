import { sql } from "drizzle-orm";
import { bigint, index, integer, jsonb, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

export const invoiceRecords = pgTable(
  "invoice_records",
  {
    id: text("id").primaryKey(),
    sourceKey: text("source_key").notNull(),
    number: text("number").notNull(),
    prefix: text("prefix").notNull().default(""),
    folio: text("folio").notNull(),
    supplier: text("supplier").notNull(),
    supplierNit: text("supplier_nit").notNull().default(""),
    amount: bigint("amount", { mode: "number" }).notNull().default(0),
    dueDate: text("due_date"),
    dueSource: text("due_source").notNull().default("No registrada"),
    receivedAt: text("received_at").notNull(),
    area: text("area").notNull().default(""),
    costCenter: text("cost_center").notNull().default(""),
    recipientName: text("recipient_name").notNull(),
    recipientNit: text("recipient_nit").notNull(),
    stage: text("stage").notNull().default("Nueva"),
    currentRole: text("current_role").notNull().default("Radicador"),
    assignedTo: text("assigned_to"),
    paymentTerm: text("payment_term"),
    documentType: text("document_type").notNull().default("Factura electrónica"),
    sourceSubject: text("source_subject").notNull().default(""),
    documentReference: text("document_reference"),
    routingHint: text("routing_hint").notNull().default("CXP"),
    relatedDocumentReference: text("related_document_reference"),
    documentReason: text("document_reason"),
    description: text("description").notNull().default(""),
    cufe: text("cufe"),
    history: text("history").notNull().default("[]"),
    workflowState: jsonb("workflow_state").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    mailbox: text("mailbox").notNull(),
    sourceMessageId: text("source_message_id").notNull(),
    sourceAttachmentId: text("source_attachment_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sourceKeyUnique: uniqueIndex("uq_invoice_records_source_key").on(table.sourceKey),
    currentRoleIndex: index("idx_invoice_records_current_role").on(table.currentRole),
    dueDateIndex: index("idx_invoice_records_due_date").on(table.dueDate),
  }),
);

export const invoiceFiles = pgTable(
  "invoice_files",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoiceRecords.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    fileKind: text("file_kind").notNull(),
    contentType: text("content_type").notNull(),
    objectKey: text("object_key").notNull(),
    size: integer("size").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    invoiceFilenameUnique: uniqueIndex("uq_invoice_files_invoice_filename").on(table.invoiceId, table.filename),
    invoiceIndex: index("idx_invoice_files_invoice_id").on(table.invoiceId),
  }),
);

export const ingestionMessages = pgTable(
  "ingestion_messages",
  {
    id: serial("id").primaryKey(),
    messageId: text("message_id").notNull(),
    attachmentId: text("attachment_id").notNull(),
    mailbox: text("mailbox").notNull(),
    subject: text("subject").notNull().default(""),
    receivedAt: text("received_at").notNull(),
    attachmentName: text("attachment_name").notNull(),
    status: text("status").notNull().default("processing"),
    errorMessage: text("error_message"),
    invoiceId: text("invoice_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    messageAttachmentUnique: uniqueIndex("uq_ingestion_messages_message_attachment").on(table.messageId, table.attachmentId),
    statusIndex: index("idx_ingestion_messages_status").on(table.status),
  }),
);
