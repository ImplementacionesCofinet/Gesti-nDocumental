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

async function documentUrl(objectKey: string, token: string) {
  const driveId = await getDriveId(token);
  const path = objectKey.split("/").map(encodeURIComponent).join("/");
  return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${path}`;
}

async function ensureInvoiceFolder(token: string, driveId: string, invoiceId: string) {
  const folderPath = `invoices/${encodeURIComponent(invoiceId)}`;
  const folderUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${folderPath}`;
  const existing = await fetch(folderUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (existing.ok) return;
  if (existing.status !== 404) throw new Error(`No fue posible comprobar la carpeta de SharePoint (${existing.status}).`);

  const rootUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children`;
  const rootFolder = await fetch(rootUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "invoices", folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    cache: "no-store",
  });
  if (!rootFolder.ok && rootFolder.status !== 409) {
    throw new Error(`No fue posible crear la carpeta de facturas en SharePoint (${rootFolder.status}).`);
  }

  const parentResponse = await fetch(rootUrl.replace(/\/children$/, ":/invoices"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!parentResponse.ok) throw new Error(`No fue posible resolver la carpeta de facturas en SharePoint (${parentResponse.status}).`);
  const parent = (await parentResponse.json()) as { id?: string };
  if (!parent.id) throw new Error("Microsoft Graph no devolvió la carpeta de facturas.");

  const childResponse = await fetch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parent.id)}/children`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: invoiceId, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    cache: "no-store",
  });
  if (!childResponse.ok && childResponse.status !== 409) {
    throw new Error(`No fue posible crear la carpeta del expediente en SharePoint (${childResponse.status}).`);
  }
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