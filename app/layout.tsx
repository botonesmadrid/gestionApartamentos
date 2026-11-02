import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "./AppShell";
import RegistrarSW from "./RegistrarSW";

export const metadata: Metadata = {
  title: "El Botones",
  description: "Reservas, huéspedes y contratos de los apartamentos",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "El Botones" },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#1C2321",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // pantalla completa en móviles con muesca (con márgenes seguros en la barra inferior)
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
        <RegistrarSW />
      </body>
    </html>
  );
}
