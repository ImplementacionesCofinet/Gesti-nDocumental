import { getMicrosoftGraphToken } from "@/lib/microsoft-graph";

let resolvedDriveId: string | undefined;

async function getDriveId(token: string) {
  const configuredDriveId = process.env.SHAREPOINT_DRIVE_ID?.trim();
  if (configuredDriveId) return configuredDriveId;
  if (resolvedDriveId) return resolvedDriveId;

  const siteId = process.env.SHAREPOINT_SITE_ID?.trim();
  if (!siteId) throw new Error("Configura SHAREPOINT_DRIVE_ID o SHAREPOINT_SITE_ID.");
  const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drive`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`No fue posible resolver la biblioteca de SharePoint (${response.status}).`);
  const drive = (await response.json()) as { id?: string };
  if (!drive.id) throw new Error("Microsoft Graph no devolvió el ID de la biblioteca de SharePoint.");
  resolvedDriveId = drive.id;
  return drive.id;
}

function configuredDocumentFolder() {
  const configured = process.env.SHAREPOINT_DOCUMENT_FOLDER?.trim().replace(/^\/+|\/+$/g, "");
  return configured || "invoices";
}

async function documentUrl(objectKey: string, token: string) {
  const driveId = await getDriveId(token);
  const [, invoiceFolder, ...fileParts] = objectKey.split("/");
  const storageSegments = [...configuredDocumentFolder().split("/").filter(Boolean), invoiceFolder, ...fileParts];
  const path = storageSegments.map(encodeURIComponent).join("/");
  return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${path}`;
}

async function ensureFolderPath(token: string, driveId: string, segments: string[]) {
  let path = "";
  let parentId: string | undefined;

  for (const segment of segments) {
    path = path ? `${path}/${encodeURIComponent(segment)}` : encodeURIComponent(segment);
    const folderUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${path}`;
    const existing = await fetch(folderUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (existing.ok) {
      const folder = (await existing.json()) as { id?: string };
      if (!folder.id) throw new Error("SharePoint no devolvió el ID de la carpeta.");
      parentId = folder.id;
      continue;
    }
    if (existing.status !== 404) throw new Error(`No fue posible comprobar la carpeta de SharePoint (${existing.status}).`);

    const childrenUrl = parentId
      ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children`
      : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children`;
    const created = await fetch(childrenUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: segment, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
      cache: "no-store",
    });
    if (!created.ok && created.status !== 409) {
      throw new Error(`No fue posible crear la carpeta '${segment}' en SharePoint (${created.status}).`);
    }

    if (created.ok) {
      const folder = (await created.json()) as { id?: string };
      if (!folder.id) throw new Error("SharePoint no devolvió el ID de la carpeta creada.");
      parentId = folder.id;
    } else {
      const resolved = await fetch(folderUrl, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!resolved.ok) throw new Error(`No fue posible resolver la carpeta '${segment}' en SharePoint (${resolved.status}).`);
      const folder = (await resolved.json()) as { id?: string };
      if (!folder.id) throw new Error("SharePoint no devolvió el ID de la carpeta creada.");
      parentId = folder.id;
    }
  }
}

async function ensureInvoiceFolder(token: string, driveId: string, invoiceId: string) {
  const segments = [...configuredDocumentFolder().split("/").filter(Boolean), invoiceId];
  await ensureFolderPath(token, driveId, segments);
}

export async function uploadDocument(objectKey: string, content: Uint8Array, contentType: string) {
  const token = await getMicrosoftGraphToken();
  const driveId = await getDriveId(token);
  const [rootFolder, invoiceFolder] = objectKey.split("/");
  if (rootFolder !== "invoices" || !invoiceFolder) throw new Error("La ruta del documento no corresponde a un expediente válido.");
  await ensureInvoiceFolder(token, driveId, invoiceFolder);
  const response = await fetch(`${await documentUrl(objectKey, token)}:/content`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    body: new Blob([content as BlobPart], { type: contentType }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`No fue posible almacenar el documento en SharePoint (${response.status}).`);
}

export async function downloadDocument(objectKey: string) {
  const token = await getMicrosoftGraphToken();
  const response = await fetch(`${await documentUrl(objectKey, token)}:/content`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`No fue posible recuperar el documento de SharePoint (${response.status}).`);
  return response;
}

export async function deleteDocument(objectKey: string) {
  const token = await getMicrosoftGraphToken();
  const response = await fetch(await documentUrl(objectKey, token), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`No fue posible eliminar el documento de SharePoint (${response.status}).`);
  }
}

export function isDocumentStorageConfigured() {
  return Boolean(
    (process.env.SHAREPOINT_DRIVE_ID?.trim() || process.env.SHAREPOINT_SITE_ID?.trim()) &&
      process.env.GRAPH_TENANT_ID?.trim() &&
      process.env.GRAPH_CLIENT_ID?.trim() &&
      process.env.GRAPH_CLIENT_SECRET?.trim(),
  );
}