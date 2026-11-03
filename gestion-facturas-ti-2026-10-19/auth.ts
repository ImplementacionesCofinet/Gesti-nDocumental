import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const allowedRoles = new Set([
  "Administrador",
  "Radicador",
  "Aprobador",
  "Contabilidad",
  "Rechazos DIAN manuales",
  "Tesorería",
  "Legalizaciones",
]);

export function roleAssignments(): Record<string, string> {
  try {
    const value = JSON.parse(process.env.APP_ROLE_ASSIGNMENTS ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const assignments: Record<string, string> = {};
    for (const [email, role] of Object.entries(value as Record<string, unknown>)) {
      if (email.includes("@") && typeof role === "string" && allowedRoles.has(role)) {
        assignments[email.trim().toLowerCase()] = role;
      }
    }
    return assignments;
  } catch {
    return {};
  }
}

export function userProfiles(): Record<string, { area: string; costCenter: string }> {
  try {
    const value = JSON.parse(process.env.APP_USER_PROFILES ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const profiles: Record<string, { area: string; costCenter: string }> = {};
    for (const [email, profile] of Object.entries(value as Record<string, unknown>)) {
      if (!email.includes("@") || !profile || typeof profile !== "object" || Array.isArray(profile)) continue;
      const fields = profile as Record<string, unknown>;
      profiles[email.trim().toLowerCase()] = {
        area: typeof fields.area === "string" ? fields.area.trim().slice(0, 120) : "",
        costCenter: typeof fields.costCenter === "string" ? fields.costCenter.trim().slice(0, 120) : "",
      };
    }
    return profiles;
  } catch {
    return {};
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [MicrosoftEntraID],
  pages: { signIn: "/signin" },
  callbacks: {
    signIn({ user }) {
      return Boolean(user.email && roleAssignments()[user.email.trim().toLowerCase()]);
    },
    jwt({ token, user }) {
      const email = user?.email ?? token.email;
      token.appRole = typeof email === "string" ? roleAssignments()[email.trim().toLowerCase()] : undefined;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.appRole === "string") session.user.appRole = token.appRole;
      return session;
    },
    authorized({ auth, request }) {
      if (request.nextUrl.pathname === "/signin") return true;
      return Boolean(auth?.user?.email && auth.user.appRole);
    },
  },
});