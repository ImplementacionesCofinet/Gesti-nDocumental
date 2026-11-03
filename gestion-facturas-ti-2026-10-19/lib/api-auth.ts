import { auth } from "@/auth";

export type AppRole =
  | "Administrador"
  | "Radicador"
  | "Aprobador"
  | "Contabilidad"
  | "Rechazos DIAN manuales"
  | "Tesorería"
  | "Legalizaciones";

export async function requireApiUser(allowedRoles?: AppRole[], request?: Request) {
  if (request) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) {
      return Response.json({ error: "Origen de solicitud no permitido." }, { status: 403 });
    }
  }

  const session = await auth();
  const role = session?.user?.appRole;
  if (!session?.user?.email || !role) {
    return Response.json({ error: "Autenticación requerida." }, { status: 401 });
  }
  if (allowedRoles && !allowedRoles.includes(role as AppRole)) {
    return Response.json({ error: "No tienes permiso para esta operación." }, { status: 403 });
  }
  return { email: session.user.email, name: session.user.name ?? session.user.email, role: role as AppRole };
}