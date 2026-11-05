/** @type {import('next').NextConfig} */

// Cabeceras de seguridad (RGPD art. 32: medidas técnicas para proteger los datos personales).
// - Referrer-Policy no-referrer: los enlaces de los formularios (/f/<token>) son secretos y no deben llegar a otras webs.
// - X-Robots-Tag: ninguna página de la app (panel interno y formularios de huéspedes) debe indexarse.
const cabecerasSeguridad = [
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
