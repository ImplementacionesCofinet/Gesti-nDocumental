import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { requireApiUser } from "@/lib/api-auth";
import { invoiceFiles, invoiceRecords } from "@/db/schema";

type InvoiceFileRow = typeof invoiceFiles.$inferSelect;

function parseHistory(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof Response) return user;

  try {
    const db = getDb();
    const [rows, fileRows] = await Promise.all([
      (user.role === "Administrador"
        ? db.select().from(invoiceRecords)
        : user.role === "Aprobador"
          ? db.select().from(invoiceRecords).where(and(
              eq(invoiceRecords.currentRole, user.role),
              sql`lower(${invoiceRecords.assignedTo}) = ${user.email.toLowerCase()}`,
            ))
          : db.select().from(invoiceRecords).where(eq(invoiceRecords.currentRole, user.role)))
        .orderBy(desc(invoiceRecords.receivedAt)),
      db.select().from(invoiceFiles),
    ]);

    const filesByInvoice = new Map<string, InvoiceFileRow[]>();
    for (const file of fileRows) {
      const files = filesByInvoice.get(file.invoiceId) ?? [];
      files.push(file);
      filesByInvoice.set(file.invoiceId, files);
    }

    const invoices = rows.map((row) => {
      const files = filesByInvoice.get(row.id) ?? [];
      const sourceFiles = files.filter((file) => file.fileKind === "pdf" || file.fileKind === "xml");
      const supportFiles = files.filter((file) => file.fileKind === "support");
      const sourceFileUrls = Object.fromEntries(sourceFiles.map((file) => [file.filename, `/api/inbox/files/${file.id}`]));
      const supportFileUrls = Object.fromEntries(supportFiles.map((file) => [file.filename, `/api/inbox/files/${file.id}`]));
      const rejectionCertificateFile = files.find((file) => file.fileKind === "rejection_certificate" && file.id === row.workflowState.rejectionCertificate);
      const paymentProofFile = files.find((file) => file.fileKind === "payment_proof" && file.id === row.workflowState.paymentProof);
      const pdfFile = sourceFiles.find((file) => file.fileKind === "pdf");
      const xmlFile = sourceFiles.find((file) => file.fileKind === "xml");

      return {
        ...row.workflowState,
        id: row.id,
        number: row.number,
        prefix: row.prefix,
        folio: row.folio,
        supplier: row.supplier,
        nit: row.supplierNit,
        amount: row.amount,
        dueDate: row.dueDate ?? "",
        dueSource: row.dueSource,
        received: row.receivedAt.slice(0, 10),
        area: row.area,
        costCenter: row.costCenter,
        recipientName: row.recipientName,
        recipientNit: row.recipientNit,
        stage: row.stage,
        currentRole: row.currentRole,
        assignedTo: row.assignedTo ?? undefined,
        paymentTerm: row.paymentTerm ?? undefined,
        documentType: row.documentType,
        sourceSubject: row.sourceSubject,
        documentReference: row.documentReference ?? undefined,
        routingHint: row.routingHint,
        relatedDocumentReference: row.relatedDocumentReference ?? undefined,
        documentReason: row.documentReason ?? undefined,
        description: row.description,
        attachments: files.length,
        sourceTime: "Recepción automática",
        sourceFiles: sourceFiles.map((file) => file.filename),
        supportFiles: supportFiles.map((file) => file.filename),
        sourceFileUrls,
        supportFileUrls,
        pdfUrl: pdfFile ? `/api/inbox/files/${pdfFile.id}` : undefined,
        xmlUrl: xmlFile ? `/api/inbox/files/${xmlFile.id}` : undefined,
        rejectionCertificate: rejectionCertificateFile?.filename,
        rejectionCertificateUrl: rejectionCertificateFile ? `/api/inbox/files/${rejectionCertificateFile.id}` : undefined,
        paymentProof: paymentProofFile?.filename,
        paymentProofUrl: paymentProofFile ? `/api/inbox/files/${paymentProofFile.id}` : undefined,
        cufe: row.cufe ?? undefined,
        comments: Array.isArray(row.workflowState.comments) ? row.workflowState.comments : [],
        history: parseHistory(row.history),
      };
    });

    return Response.json({ invoices, persistent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible consultar las facturas almacenadas.";
    return Response.json({ error: message, invoices: [], persistent: false }, { status: 500 });
  }
}

