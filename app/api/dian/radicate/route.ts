import { requireApiUser } from "@/lib/api-auth"

export async function POST(request: Request) {
  const user = await requireApiUser(["Administrador", "Radicador"], request)
  if (user instanceof Response) return user

  return Response.json(
    { error: "La consulta oficial de documentos DIAN no está integrada; se deshabilitó la radicación simulada." },
    { status: 501 },
  );
}
