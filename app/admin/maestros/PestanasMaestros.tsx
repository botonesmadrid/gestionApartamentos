"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PestanasMaestros({
  pestanas,
}: {
  pestanas: { slug: string; titulo: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Maestros" className="-mx-6 overflow-x-auto px-6">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {pestanas.map((p) => {
          const activa = pathname === `/admin/maestros/${p.slug}`;
          return (
            <li key={p.slug}>
              <Link
                href={`/admin/maestros/${p.slug}`}
                aria-current={activa ? "page" : undefined}
                className={`-mb-px block whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                  activa
                    ? "border-ink font-medium text-ink"
                    : "border-transparent text-ink/60 hover:border-line hover:text-ink"
                }`}
              >
                {p.titulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
