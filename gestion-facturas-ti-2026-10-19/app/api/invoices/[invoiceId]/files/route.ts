import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoiceFiles, invoiceRecords } from "@/db/schema";
import { requireApiUser } from "@/lib/api-auth";
import { deleteDocument, uploadDocument } from "@/lib/document-storage";

const maxFileSize = 4 * 1024 * 1024;

const fileKinds = {
  support: { roles: null, contentTypes: ["application/pdf", "image/jpeg", "image/png"] },
  rejection_certificate: { roles: ["Rechazos DIAN manuales"], contentTypes: ["application/pdf", "image/jpeg", "image/png"] },
  payment_proof: { roles: ["Tesorería"], contentTypes: ["application/pdf", "image/jpeg", "image/png"] },
} as const;

function safeFilename(value: string) {
  const base = value.split(/[\\/]/).pop() || "documento";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160);
}

function detectedContentType(bytes: Uint8Array) {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const user = await requireApiUser(undefined, request);
  if (user instanceof Response) return user;

  try {
    const { invoiceId } = await params;
    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind");
    if (!(file instanceof File) || typeof kind !== "string" || !(kind in fileKinds)) {
      return Response.json({ error: "Selecciona un archivo y un tipo de documento válido." }, { status: 400 });
    }
    const config = fileKinds[kind as keyof typeof fileKinds];
    if (config.roles && user.role !== "Administrador" && !config.roles.includes(user.role as never)) {
      return Response.json({ error: "No tienes permiso para cargar este tipo de documento." }, { status: 403 });
    }
    if (file.size < 1 || file.size > maxFileSize) {
      return Response.json({ error: "El archivo debe pesar como máximo 4 MB." }, { status: 413 });
    }

    const db = getDb();
    const [invoice] = await db.select().from(invoiceRecords).where(eq(invoiceRecords.id, invoiceId)).limit(1);
    if (!invoice) return Response.json({ error: "Factura no encontrada." }, { status: 404 });
    if (user.role !== "Administrador" && invoice.currentRole !== user.role) {
      return Response.json({ error: "Esta factura no está en tu bandeja." }, { status: 403 });
    }
    if (user.role === "Aprobador" && invoice.assignedTo?.toLowerCase() !== user.email.toLowerCase()) {
      return Response.json({ error: "Esta factura está asignada a otro aprobador." }, { status: 403 });
    }
    if (kind === "support") {
      const existingFiles = await db.select({ id: invoiceFiles.id }).from(invoiceFiles).where(eq(invoiceFiles.invoiceId, invoiceId));
      if (existingFiles.length >= 6) {
        return Response.json({ error: "Este expediente ya tiene el máximo de seis archivos." }, { status: 409 });
      }
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = detectedContentType(bytes);
    if (!contentType || !config.contentTypes.includes(contentType as never)) {
      return Response.json({ error: "El contenido debe ser un PDF, PNG o JPEG válido." }, { status: 415 });
    }

    const fileId = crypto.randomUUID();
    const filename = safeFilename(file.name);
    const objectKey = `invoices/${invoiceId}/${fileId}-${filename}`;
    await uploadDocument(objectKey, bytes, contentType);

    try {
      const [savedFile] = await db.insert(invoiceFiles).values({
        id: fileId,
        invoiceId,
        filename,
        fileKind: kind,
        contentType,
        objectKey,
        size: bytes.byteLength,
      }).returning({ id: invoiceFiles.id, filename: invoiceFiles.filename });

      if (kind === "rejection_certificate" || kind === "payment_proof") {
        const stateField = kind === "rejection_certificate" ? "rejectionCertificate" : "paymentProof";
        await db.update(invoiceRecords)
          .set({
            workflowState: { ...invoice.workflowState, [stateField]: fileId },
            history: JSON.stringify([
              `${new Date().toISOString()} · ${user.name} (${user.role}) cargó ${filename}`,
              ...parseHistory(invoice.history),
            ]),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(invoiceRecords.id, invoiceId));
      } else {
        await db.update(invoiceRecords)
          .set({
            history: JSON.stringify([
              `${new Date().toISOString()} · ${user.name} (${user.role}) cargó ${filename}`,
              ...parseHistory(invoice.history),
            ]),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(invoiceRecords.id, invoiceId));
      }

      return Response.json({
        id: savedFile.id,
        filename: savedFile.filename,
        url: `/api/inbox/files/${savedFile.id}`,
      }, { status: 201 });
    } catch (error) {
      await db.delete(invoiceFiles).where(eq(invoiceFiles.id, fileId));
      try {
        await deleteDocument(objectKey);
      } catch {
        // Keep the original persistence error; an orphan is safer than hiding the failure.
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible guardar el documento.";
    return Response.json({ error: message }, { status: 500 });
  }
}

function parseHistory(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}