import { desc } from "drizzle-orm"
import { getDb } from "@/db"
import { requireApiUser } from "@/lib/api-auth"
import { invoiceRecords } from "@/db/schema"
import { readDianWorkbook, type DianRow } from "@/lib/dian-xlsx"

const expectedRecipientNit = "901373083"

function normalizeNit(value: string) {
  return value.replace(/\D/g, "").slice(0, 9)
}

function isSupportedDocument(value: string) {
  const normalized = value.toLowerCase()
  return normalized.includes("factura") || normalized.includes("nota") || normalized.includes("documento equivalente")
}

function invoiceKey(nit: string, prefix: string, folio: string) {
  return [normalizeNit(nit), prefix.trim().toUpperCase(), folio.trim()].join(":")
}

function rowSummary(row: DianRow) {
  return {
    rowNumber: row.rowNumber,
    documentType: row.documentType,
    cufe: row.cufe,
    prefix: row.prefix,
    folio: row.folio,
    supplierNit: row.supplierNit,
    supplierName: row.supplierName,
    recipientNit: row.recipientNit,
    recipientName: row.recipientName,
    total: row.total,
    issueDate: row.issueDate,
    receivedAt: row.receivedAt,
    state: row.state,
    group: row.group,
  }
}

export async function POST(request: Request) {
  const user = await requireApiUser(["Administrador", "Radicador"], request)
  if (user instanceof Response) return user

  try {
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return Response.json({ error: "Selecciona el archivo Excel descargado de la DIAN." }, { status: 400 })
    if (!/\.xlsx$/i.test(file.name)) return Response.json({ error: "El archivo debe estar en formato .xlsx, como el listado descargado desde la DIAN." }, { status: 400 })

    const parsed = readDianWorkbook(new Uint8Array(await file.arrayBuffer()))
    const db = getDb()
    const existing = await db.select().from(invoiceRecords).orderBy(desc(invoiceRecords.receivedAt))
    const byCufe = new Map(existing.filter((invoice) => invoice.cufe).map((invoice) => [invoice.cufe!.trim().toLowerCase(), invoice]))
    const bySupplierDocument = new Map(existing.map((invoice) => [invoiceKey(invoice.supplierNit, invoice.prefix, invoice.folio), invoice]))

    const alreadyRadicated: ReturnType<typeof rowSummary>[] = []
    const missingDocuments: ReturnType<typeof rowSummary>[] = []
    const invalidRecipient: ReturnType<typeof rowSummary>[] = []
    const notRadicable: ReturnType<typeof rowSummary>[] = []
    const matchedBy = { cufe: 0, supplierDocument: 0 }

    for (const row of parsed.rows) {
      const summary = rowSummary(row)
      if (!isSupportedDocument(row.documentType)) {
        notRadicable.push(summary)
        continue
      }
      if (normalizeNit(row.recipientNit) !== expectedRecipientNit) {
        invalidRecipient.push(summary)
        continue
      }
      const cufeMatch = row.cufe ? byCufe.get(row.cufe.trim().toLowerCase()) : undefined
      const documentMatch = bySupplierDocument.get(invoiceKey(row.supplierNit, row.prefix, row.folio))
      if (cufeMatch) {
        matchedBy.cufe += 1
        alreadyRadicated.push(summary)
      } else if (documentMatch) {
        matchedBy.supplierDocument += 1
        alreadyRadicated.push(summary)
      } else {
        missingDocuments.push(summary)
      }
    }

    return Response.json({
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      expectedRecipientNit,
      totalRows: parsed.rows.length,
      invoiceRows: alreadyRadicated.length + missingDocuments.length + invalidRecipient.length,
      alreadyRadicated: alreadyRadicated.length,
      missingDocuments: missingDocuments.length,
      invalidRecipient: invalidRecipient.length,
      notRadicable: notRadicable.length,
      matchedBy,
      notes: [
        "El cruce principal se hace por CUFE/CUDE.",
        "Si una factura no tiene CUFE en el registro, se revisa como respaldo por NIT del emisor + prefijo + folio.",
        "El Excel de la DIAN no contiene PDF ni XML. Los faltantes se radican automáticamente cuando el ZIP con ambos archivos está disponible en el buzón y se sincroniza.",
      ],
      missing: missingDocuments,
      invalid: invalidRecipient,
      notRadicableRows: notRadicable.slice(0, 50),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible leer el listado DIAN."
    return Response.json({ error: message }, { status: 400 })
  }
}
