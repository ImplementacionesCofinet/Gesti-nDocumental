import { roleAssignments, userProfiles } from "@/auth";
import { requireApiUser } from "@/lib/api-auth";

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof Response) return user;

  const assignments = roleAssignments();
  const profiles = userProfiles();
  const approvers = Object.entries(assignments)
    .filter(([, role]) => role === "Aprobador")
    .map(([email]) => ({ email, ...(profiles[email] ?? { area: "", costCenter: "" }) }))
    .sort((left, right) => left.email.localeCompare(right.email));

  return Response.json({
    users: user.role === "Administrador" || user.role === "Radicador" ? approvers : [],
    profile: profiles[user.email.toLowerCase()] ?? { area: "", costCenter: "" },
  });
}