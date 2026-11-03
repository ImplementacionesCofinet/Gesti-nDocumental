let cachedToken: { value: string; expiresAt: number } | undefined;

export async function getMicrosoftGraphToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const tenantId = process.env.GRAPH_TENANT_ID?.trim();
  const clientId = process.env.GRAPH_CLIENT_ID?.trim();
  const clientSecret = process.env.GRAPH_CLIENT_SECRET?.trim();
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Faltan las credenciales de Microsoft Graph.");
  }

  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`No fue posible obtener acceso a Microsoft Graph (${response.status}).`);

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("Microsoft Graph no devolvió un token de acceso.");
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}