import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { requireApiUser } from "@/lib/api-auth";
import { downloadDocument } from "@/lib/document-storage";
import { invoiceFiles, invoiceRecords } from "@/db/schema";

function safeHeaderFilename(filename: string) {
  return filename.replace(/[\r\n"\\]/g, "_");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;

  const { fileId } = await params;

  try {
    const db = getDb();
    const [file] = await db.select().from(invoiceFiles).where(eq(invoiceFiles.id, fileId)).limit(1);
    if (!file) return Response.json({ error: "Archivo no encontrado." }, { status: 404 });
    const [invoice] = await db.select().from(invoiceRecords).where(eq(invoiceRecords.id, file.invoiceId)).limit(1);
    if (!invoice) return Response.json({ error: "Factura no encontrada." }, { status: 404 });
    if (user.role !== "Administrador" && invoice.currentRole !== user.role) {
      return Response.json({ error: "Esta factura no está en tu bandeja." }, { status: 403 });
    }
    if (user.role === "Aprobador" && invoice.assignedTo?.toLowerCase() !== user.email.toLowerCase()) {
      return Response.json({ error: "Esta factura está asignada a otro aprobador." }, { status: 403 });
    }

    const object = await downloadDocument(file.objectKey);

    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(object.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.size),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeHeaderFilename(file.filename)}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible leer el archivo.";
    return Response.json({ error: message }, { status: 500 });
  }
}
