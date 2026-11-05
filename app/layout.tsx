import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "./AppShell";
import RegistrarSW from "./RegistrarSW";
import { Fraunces, Inter } from "next/font/google";

// Fuentes alojadas con la propia app (next/font las descarga al compilar): el navegador de los usuarios y huéspedes no
// se conecta a Google Fonts, que recibiría su dirección IP (RGPD).
const fraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-fraunces", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });

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
    <html lang="es" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="bg-paper text-ink font-body antialiased">
        <AppShell>{children}</AppShell>
        <RegistrarSW />
      </body>
    </html>
  );
}
