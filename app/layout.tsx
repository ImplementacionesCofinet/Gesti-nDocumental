import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestión de facturas | Cuentas por pagar",
  description: "Bandeja interna para revisar, aprobar y dar seguimiento a facturas electrónicas.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="antialiased"><Providers>{children}</Providers></body>
    </html>
  );
}
