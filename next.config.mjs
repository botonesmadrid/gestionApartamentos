/** @type {import('next').NextConfig} */

// Cabeceras de seguridad (RGPD art. 32: medidas técnicas para proteger los datos personales).
// - Referrer-Policy no-referrer: los enlaces de los formularios (/f/<token>) son secretos y no deben llegar a otras webs.
// - X-Robots-Tag: ninguna página de la app (panel interno y formularios de huéspedes) debe indexarse.
// - Content-Security-Policy: la página solo puede cargar código propio y hablar con Supabase. Limita el daño de una
//   posible inyección de código (no podría enviar los datos a otro servidor). 'unsafe-inline' en scripts lo necesita
//   Next.js para sus scripts de arranque.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : "*.supabase.co";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' https://${supabase} wss://${supabase}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const cabecerasSeguridad = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: cabecerasSeguridad }];
  },
};
export default nextConfig;
