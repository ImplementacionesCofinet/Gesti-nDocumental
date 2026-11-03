import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { appRole: string };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appRole?: string;
  }
}