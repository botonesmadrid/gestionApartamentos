"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// Navegación entre maestros: columna lateral en pantallas anchas y desplegable en móvil
// (sin scroll horizontal).
export default function PestanasMaestros({
  pestanas,
}: {
  pestanas: { slug: string; titulo: string }[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const activa = pestanas.find((p) => pathname === `/admin/maestros/${p.slug}`)?.slug ?? "";

  return (
    <>
      <div className="lg:hidden">
        <label htmlFor="maestro">Maestro</label>
        <select id="maestro" value={activa} onChange={(e) => router.push(`/admin/maestros/${e.target.value}`)}>
          {pestanas.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.titulo}
            </option>
          ))}
        </select>
      </div>
      <nav aria-label="Maestros" className="hidden lg:block">
        <ul className="space-y-0.5">
          {pestanas.map((p) => {
            const esActiva = p.slug === activa;
            return (
              <li key={p.slug}>
                <Link
                  href={`/admin/maestros/${p.slug}`}
                  aria-current={esActiva ? "page" : undefined}
                  className={`block rounded-md px-3 py-2 text-sm ${
                    esActiva ? "bg-ink font-medium text-paper" : "text-ink/70 hover:bg-white hover:text-ink"
                  }`}
                >
                  {p.titulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
