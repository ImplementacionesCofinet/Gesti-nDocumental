import { and, eq } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import { getDb } from "@/db";
import { requireApiUser } from "@/lib/api-auth";
import { isDocumentStorageConfigured, uploadDocument } from "@/lib/document-storage";
import { getMicrosoftGraphToken } from "@/lib/microsoft-graph";
import { ingestionMessages, invoiceFiles, invoiceRecords } from "@/db/schema";

const expectedRecipientNit = "901373083";

type GraphMessage = {
  id: string;
  subject?: string;
  receivedDateTime: string;
  hasAttachments?: boolean;
};

type GraphAttachment = {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  "@odata.type"?: string;
  contentBytes?: string;
};

type SupportMetadata = {
  documentType: "Cuenta de cobro" | "Documento soporte";
  recipientNit: string;
  supplierNit: string;
  supplierName: string;
  reference: string;
  destination: "CXP" | "LEGALIZACIONES";
};

type ParsedInvoice = {
  number: string;
  prefix: string;
  folio: string;
  supplier: string;
  supplierNit: string;
  amount: number;
  issueDate: string;
  dueDate: string | null;
  dueSource: string;
  recipientName: string;
  recipientNit: string;
  paymentTerm: string | null;
  documentType: "Factura electrónica" | "Nota crédito" | "Nota débito" | "Documento equivalente";
  description: string;
  cufe: string | null;
};

function configuration() {
  return {
    mailbox: process.env.INVOICE_MAILBOX_ADDRESS?.trim() || "",
    tenantId: process.env.GRAPH_TENANT_ID?.trim() || "",
    clientId: process.env.GRAPH_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GRAPH_CLIENT_SECRET?.trim() || "",
    mailboxStartDate: process.env.INVOICE_MAILBOX_START_DATE?.trim() || "2026-10-01",
  };
}

function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function normalizeNit(value: string) {
  return value.replace(/\D/g, "").slice(0, 9);
}

function matchesRecipientNit(value: string) {
  return normalizeNit(value) === expectedRecipientNit;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function tagPattern(tag: string) {
  return new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${tag}>`, "i");
}

function extractTag(scope: string, tag: string) {
  const match = scope.match(tagPattern(tag));
  return match ? decodeXmlEntities(match[1]) : "";
}

function extractTags(scope: string, tag: string) {
  const pattern = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${tag}>`, "gi");
  return [...scope.matchAll(pattern)].map((match) => decodeXmlEntities(match[1]));
}

function extractBlock(scope: string, tag: string) {
  const match = scope.match(new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${tag}\\b[\\s\\S]*?<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${tag}>`, "i"));
  return match?.[0] ?? "";
}

function extractInvoiceXml(rawXml: string) {
  const document = rawXml.match(new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?(?:Invoice|CreditNote|DebitNote)\\b[\\s\\S]*?<\\/(?:(?:[A-Za-z_][\\w.-]*):)?(?:Invoice|CreditNote|DebitNote)>`, "i"));
  return document?.[0] ?? rawXml;
}

function parseAmount(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/,(?=\d{3}(?:\D|$))/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function parseInvoice(rawXml: string): ParsedInvoice {
  const xml = extractInvoiceXml(rawXml);
  const supplierBlock = extractBlock(xml, "AccountingSupplierParty");
  const customerBlock = extractBlock(xml, "AccountingCustomerParty");
  const numberValue = extractTag(xml, "ID");
  const prefixFromXml = extractTag(xml, "Prefix");
  const fallbackNumber = extractTag(rawXml, "ParentDocumentID");
  const rawNumber = numberValue && !/^[0-9a-f]{64}$/i.test(numberValue) ? numberValue : fallbackNumber;
  const numberMatch = rawNumber.match(/^([A-Za-z]+)[-\s]?(\d+)$/);
  const prefix = prefixFromXml || numberMatch?.[1] || "";
  const folio = numberMatch?.[2] || rawNumber;
  const number = prefix && folio && !rawNumber.includes("-") ? `${prefix}-${folio}` : rawNumber || folio;
  const dueDate = extractTag(xml, "PaymentDueDate") || extractTag(xml, "DueDate") || null;
  const issueDate = extractTag(xml, "IssueDate");
  const invoiceLine = extractBlock(xml, "InvoiceLine") || extractBlock(xml, "CreditNoteLine") || extractBlock(xml, "DebitNoteLine");
  const invoiceTypeCode = extractTag(xml, "InvoiceTypeCode");
  const uuidValues = extractTags(xml, "UUID").filter((value) => value.length >= 60 && !/CUDE/i.test(value));
  const paymentDue = dueDate ? `Vencimiento ${dueDate.split("-").reverse().join("/")}` : null;
  const documentType = /<(?:(?:[A-Za-z_][\\w.-]*):)?CreditNote\\b/i.test(xml)
    ? "Nota crédito"
    : /<(?:(?:[A-Za-z_][\\w.-]*):)?DebitNote\\b/i.test(xml)
      ? "Nota débito"
      : invoiceTypeCode.startsWith("03")
        ? "Documento equivalente"
        : "Factura electrónica";

  return {
    number,
    prefix,
    folio,
    supplier: extractTag(supplierBlock, "RegistrationName") || "Proveedor no identificado",
    supplierNit: normalizeNit(extractTag(supplierBlock, "CompanyID")),
    amount: parseAmount(extractTag(xml, "PayableAmount")),
    issueDate,
    dueDate,
    dueSource: dueDate ? "XML" : "No registrada",
    recipientName: extractTag(customerBlock, "RegistrationName") || "Destinatario no identificado",
    recipientNit: normalizeNit(extractTag(customerBlock, "CompanyID")),
    paymentTerm: paymentDue,
    documentType,
    description: extractTag(invoiceLine, "Description") || "Detalle no informado en el XML.",
    cufe: uuidValues[0] ?? null,
  };
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function safeFilename(value: string) {
  const base = value.split(/[\\/]/).pop() || "archivo";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

function fileKind(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".xml")) return "xml";
  return "support";
}

function subjectField(subject: string, names: string[]) {
  const namePattern = names.join("|");
  const match = subject.match(new RegExp(`(?:^|[|\\s])(?:${namePattern})\\s*[:=]\\s*([^|]+?)(?=\\s+(?:[A-Z_]+\\s*[:=])|\\s*\\||$)`, "i"));
  return match?.[1]?.trim() || "";
}

function parseSupportSubject(subject: string): SupportMetadata | null {
  const normalized = subject.trim();
  if (!/(?:\\[GD\\])?\\s*(?:\\[SOPORTE\\]|CUENTA(?:[_\\s]+DE)?[_\\s]+COBRO|DOCUMENTO[_\\s]+SOPORTE)/i.test(normalized)) return null;
  const documentType = /DOCUMENTO[_\\s]+SOPORTE/i.test(normalized) && !/CUENTA(?:[_\\s]+DE)?[_\\s]+COBRO/i.test(normalized) ? "Documento soporte" : "Cuenta de cobro";
  const destination = /DESTINO\\s*[:=]\\s*LEGALIZACIONES/i.test(normalized) ? "LEGALIZACIONES" : "CXP";
  return {
    documentType,
    recipientNit: normalizeNit(subjectField(normalized, ["RECEPTOR_NIT", "NIT_RECEPTOR", "DESTINATARIO_NIT"])),
    supplierNit: normalizeNit(subjectField(normalized, ["PROVEEDOR_NIT", "NIT_PROVEEDOR"])),
    supplierName: subjectField(normalized, ["PROVEEDOR", "RAZON_SOCIAL"]) || "Proveedor de cuenta de cobro",
    reference: subjectField(normalized, ["REF", "REFERENCIA", "NUMERO", "NÚMERO"]),
    destination,
  };
}

function sourceKeyFor(invoice: ParsedInvoice) {
  return invoice.cufe || `${invoice.recipientNit}:${invoice.prefix}:${invoice.folio}`;
}

async function graphJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Microsoft Graph respondió ${response.status}: ${detail.slice(0, 240)}`);
  }
  return (await response.json()) as T;
}

async function getExistingMessage(messageId: string, attachmentId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(ingestionMessages)
    .where(and(eq(ingestionMessages.messageId, messageId), eq(ingestionMessages.attachmentId, attachmentId)))
    .limit(1);
  return row;
}

async function markMessage(
  messageId: string,
  attachmentId: string,
  mailbox: string,
  message: GraphMessage,
  attachmentName: string,
  status: string,
  errorMessage: string | null,
  invoiceId: string | null,
) {
  const db = getDb();
  const existing = await getExistingMessage(messageId, attachmentId);
  const values = {
    messageId,
    attachmentId,
    mailbox,
    subject: message.subject || "",
    receivedAt: message.receivedDateTime,
    attachmentName,
    status,
    errorMessage,
    invoiceId,
    updatedAt: new Date().toISOString(),
  };
  if (existing) {
    await db.update(ingestionMessages).set(values).where(eq(ingestionMessages.id, existing.id));
  } else {
    await db.insert(ingestionMessages).values(values);
  }
}

async function ingestZip(
  bytes: Uint8Array,
  attachment: GraphAttachment,
  message: GraphMessage,
  mailbox: string,
) {
  const entries = unzipSync(bytes);
  const files = Object.entries(entries)
    .filter(([name, content]) => !name.endsWith("/") && content.byteLength > 0)
    .map(([name, content]) => ({ name: safeFilename(name), content, kind: fileKind(name) }));
  const xmlFile = files.find((file) => file.kind === "xml");
  const pdfFile = files.find((file) => file.kind === "pdf");
  const supportMetadata = parseSupportSubject(message.subject || "");
  if (supportMetadata) throw new Error("Las cuentas de cobro deben enviarse como un único PDF, sin ZIP ni archivos adicionales.");
  if (!xmlFile || !pdfFile) throw new Error("El ZIP de una factura electrónica debe contener al menos un PDF y un XML.");

  const parsed = parseInvoice(strFromU8(xmlFile.content));
  if (!matchesRecipientNit(parsed.recipientNit)) {
    await markMessage(message.id, attachment.id, mailbox, message, attachment.name || "archivo.zip", "rejected", `NIT receptor no coincide con ${expectedRecipientNit}.`, null);
    return { status: "rejected", reason: "NIT receptor no coincide" };
  }

  const db = getDb();
  const sourceKey = sourceKeyFor(parsed);
  const [existing] = await db.select().from(invoiceRecords).where(eq(invoiceRecords.sourceKey, sourceKey)).limit(1);
  const invoiceId = existing?.id || crypto.randomUUID();
  if (!existing) {
    const history = [
      "Documento recibido automáticamente desde el correo",
      `Buzón de origen: ${mailbox}`,
      `Archivo recibido: ${attachment.name || "archivo.zip"}`,
      `NIT destinatario validado: ${expectedRecipientNit}`,
      parsed.dueDate ? "Fecha de vencimiento leída del XML" : "El XML no registra fecha de vencimiento",
    ];
    await db.insert(invoiceRecords).values({
      id: invoiceId,
      sourceKey,
      number: parsed.number,
      prefix: parsed.prefix,
      folio: parsed.folio,
      supplier: parsed.supplier,
      supplierNit: parsed.supplierNit,
      amount: parsed.amount,
      dueDate: parsed.dueDate,
      dueSource: parsed.dueSource,
      receivedAt: message.receivedDateTime,
      recipientName: parsed.recipientName,
      recipientNit: parsed.recipientNit,
      stage: "Nueva",
      currentRole: "Radicador",
      paymentTerm: parsed.paymentTerm,
      documentType: parsed.documentType,
      sourceSubject: message.subject || "",
      routingHint: "CXP",
      description: parsed.description,
      cufe: parsed.cufe,
      history: JSON.stringify(history),
      mailbox,
      sourceMessageId: message.id,
      sourceAttachmentId: attachment.id,
    });
  }

  if (!isDocumentStorageConfigured()) throw new Error("El almacenamiento de documentos no está configurado.");
  const existingFiles = await db.select().from(invoiceFiles).where(eq(invoiceFiles.invoiceId, invoiceId));
  const existingNames = new Set(existingFiles.map((file) => file.filename));
  for (const file of files) {
    if (existingNames.has(file.name)) continue;
    const id = crypto.randomUUID();
    const objectKey = `invoices/${invoiceId}/${id}-${file.name}`;
    const contentType = file.kind === "pdf" ? "application/pdf" : file.kind === "xml" ? "application/xml" : "application/octet-stream";
    await uploadDocument(objectKey, file.content, contentType);
    await db.insert(invoiceFiles).values({
      id,
      invoiceId,
      filename: file.name,
      fileKind: file.kind,
      contentType,
      objectKey,
      size: file.content.byteLength,
    });
  }

  await markMessage(message.id, attachment.id, mailbox, message, attachment.name || "archivo.zip", "processed", null, invoiceId);
  return { status: "processed", invoiceId };
}

async function ingestSupport(
  files: { name: string; content: Uint8Array; kind: string }[],
  attachment: GraphAttachment,
  message: GraphMessage,
  mailbox: string,
  metadata: SupportMetadata,
) {
  const pdfFile = files.find((file) => file.kind === "pdf");
  if (!pdfFile || files.length !== 1) throw new Error("La cuenta de cobro debe recibirse como un único PDF.");
  if (metadata.recipientNit !== expectedRecipientNit) {
    const reason = metadata.recipientNit ? `NIT receptor ${metadata.recipientNit} no coincide con ${expectedRecipientNit}.` : `El asunto debe incluir RECEPTOR_NIT=${expectedRecipientNit}.`;
    await markMessage(message.id, attachment.id, mailbox, message, attachment.name || pdfFile.name, "rejected", reason, null);
    return { status: "rejected", reason };
  }

  const db = getDb();
  const sourceKey = `support:${message.id}:${attachment.id}`;
  const [existing] = await db.select().from(invoiceRecords).where(eq(invoiceRecords.sourceKey, sourceKey)).limit(1);
  const invoiceId = existing?.id || crypto.randomUUID();
  const reference = metadata.reference || pdfFile.name.replace(/\\.pdf$/i, "");
  if (!existing) {
    const history = [
      "Documento soporte recibido automáticamente desde el correo",
      `Tipo identificado por asunto: ${metadata.documentType}`,
      `Buzón de origen: ${mailbox}`,
      `Asunto recibido: ${message.subject || "Sin asunto"}`,
      `NIT destinatario validado en el asunto: ${expectedRecipientNit}`,
      metadata.destination === "LEGALIZACIONES" ? "Marcado para revisión posterior en Legalizaciones" : "Marcado como documento con posible obligación de pago",
    ];
    await db.insert(invoiceRecords).values({
      id: invoiceId,
      sourceKey,
      number: reference,
      prefix: "",
      folio: reference,
      supplier: metadata.supplierName,
      supplierNit: metadata.supplierNit,
      amount: 0,
      dueDate: null,
      dueSource: "No registrada en el soporte",
      receivedAt: message.receivedDateTime,
      recipientName: "INVERSORA ARCILAZA S.A.S.",
      recipientNit: expectedRecipientNit,
      stage: "Nueva",
      currentRole: "Radicador",
      paymentTerm: null,
      documentType: metadata.documentType,
      sourceSubject: message.subject || "",
      documentReference: reference,
      routingHint: metadata.destination,
      description: `${metadata.documentType} recibida para validación en Gestión Documental. El valor, fecha y la información del proveedor deben confirmarse en el PDF.`,
      cufe: null,
      history: JSON.stringify(history),
      mailbox,
      sourceMessageId: message.id,
      sourceAttachmentId: attachment.id,
    });
  }

  if (!isDocumentStorageConfigured()) throw new Error("El almacenamiento de documentos no está configurado.");
  const existingFiles = await db.select().from(invoiceFiles).where(eq(invoiceFiles.invoiceId, invoiceId));
  const existingNames = new Set(existingFiles.map((file) => file.filename));
  for (const file of files) {
    if (existingNames.has(file.name)) continue;
    const id = crypto.randomUUID();
    const objectKey = `invoices/${invoiceId}/${id}-${file.name}`;
    const contentType = file.kind === "pdf" ? "application/pdf" : file.kind === "xml" ? "application/xml" : "application/octet-stream";
    await uploadDocument(objectKey, file.content, contentType);
    await db.insert(invoiceFiles).values({
      id,
      invoiceId,
      filename: file.name,
      fileKind: file.kind,
      contentType,
      objectKey,
      size: file.content.byteLength,
    });
  }

  await markMessage(message.id, attachment.id, mailbox, message, attachment.name || pdfFile.name, "processed", null, invoiceId);
  return { status: "processed", invoiceId };
}

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("cron") === "1") {
    if (!isCronRequest(request)) return Response.json({ error: "No autorizado." }, { status: 401 });
    return POST(new Request(request.url, {
      method: "POST",
      headers: { authorization: request.headers.get("authorization") ?? "" },
    }));
  }

  const user = await requireApiUser();
  if (user instanceof Response) return user;

  const { mailbox, tenantId, clientId, clientSecret } = configuration();
  return Response.json({
    mailbox,
    configured: Boolean(mailbox && tenantId && clientId && clientSecret),
    provider: "Microsoft Graph",
    automaticReviewSeconds: 60,
  });
}

export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    const user = await requireApiUser(["Administrador", "Radicador"], request);
    if (user instanceof Response) return user;
  }

  const { mailbox, tenantId, clientId, clientSecret } = configuration();
  if (!mailbox || !tenantId || !clientId || !clientSecret) {
    return Response.json(
      {
        error: "La conexión está pendiente de configuración. Se requieren las credenciales de Microsoft Graph y el consentimiento de administrador en Entra.",
        mailbox,
        configured: false,
      },
      { status: 503 },
    );
  }
  if (!process.env.DATABASE_URL || !isDocumentStorageConfigured()) {
    return Response.json({ error: "El almacenamiento permanente del aplicativo aún no está disponible.", mailbox }, { status: 503 });
  }

  try {
    const token = await getMicrosoftGraphToken();
    const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}`;
    const mailboxStartDate = configuration().mailboxStartDate;
    const receivedFrom = `${mailboxStartDate}T00:00:00Z`;
    const messages = await graphJson<{ value: GraphMessage[] }>(
      `${base}/mailFolders/inbox/messages?$select=id,subject,receivedDateTime,hasAttachments&$filter=hasAttachments%20eq%20true%20and%20receivedDateTime%20ge%20${encodeURIComponent(receivedFrom)}&$orderby=receivedDateTime%20desc&$top=50`,
      token,
    );
    let processed = 0;
    let rejected = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const message of messages.value || []) {
      const attachments = await graphJson<{ value: GraphAttachment[] }>(
        `${base}/messages/${encodeURIComponent(message.id)}/attachments?$select=id,name,contentType,size,isInline,@odata.type`,
        token,
      );
      const messageAttachments = (attachments.value || []).filter((attachment) => !attachment.isInline && Boolean(attachment.name));
      const supportMetadata = parseSupportSubject(message.subject || "");
      if (supportMetadata && (messageAttachments.length !== 1 || !messageAttachments[0]?.name?.toLowerCase().endsWith(".pdf"))) {
        const errorMessage = "El asunto identifica una cuenta de cobro, pero el correo debe contener un único archivo PDF.";
        for (const attachment of messageAttachments) {
          await markMessage(message.id, attachment.id, mailbox, message, attachment.name || "archivo-adjunto", "error", errorMessage, null);
          errors.push(`${attachment.name || "archivo-adjunto"}: ${errorMessage}`);
        }
        continue;
      }
      for (const attachment of messageAttachments) {
        const attachmentName = attachment.name?.toLowerCase() || "";
        const isZip = attachmentName.endsWith(".zip");
        const isPdf = attachmentName.endsWith(".pdf");
        const isSupportEmail = Boolean(supportMetadata);
        if (!isZip && !(isPdf && isSupportEmail)) continue;
        const previous = await getExistingMessage(message.id, attachment.id);
        if (previous?.status === "processed" || previous?.status === "rejected") {
          skipped += 1;
          continue;
        }
        try {
          const fullAttachment = await graphJson<GraphAttachment>(
            `${base}/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(attachment.id)}`,
            token,
          );
          if (!fullAttachment.contentBytes) throw new Error("Microsoft Graph no entregó el contenido del archivo adjunto.");
          const bytes = decodeBase64(fullAttachment.contentBytes);
          const result = isZip
            ? await ingestZip(bytes, attachment, message, mailbox)
            : await ingestSupport([{ name: attachment.name || "cuenta-de-cobro.pdf", content: bytes, kind: "pdf" }], attachment, message, mailbox, supportMetadata!);
          if (result.status === "rejected") rejected += 1;
          else processed += 1;
        } catch (error) {
          const messageText = error instanceof Error ? error.message : "No fue posible procesar el archivo adjunto.";
          errors.push(`${attachment.name}: ${messageText}`);
          await markMessage(message.id, attachment.id, mailbox, message, attachment.name || "archivo-adjunto", "error", messageText, null);
        }
      }
    }

    return Response.json({ mailbox, scannedMessages: messages.value?.length || 0, processed, rejected, skipped, errors, synchronizedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible sincronizar el buzón.";
    return Response.json({ error: message, mailbox }, { status: 502 });
  }
}
