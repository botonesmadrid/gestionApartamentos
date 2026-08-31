import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "./AppShell";

export const metadata: Metadata = {
  title: "Gestión de Apartamentos",
  description: "Reservas y huéspedes por apartamento",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Apartamentos" },
};

export const viewport: Viewport = {
  themeColor: "#1C2321",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
        />
      </head>
      <body className="bg-paper text-ink font-body antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
