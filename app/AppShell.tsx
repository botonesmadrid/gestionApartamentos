"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const RUTAS_SIN_NAV = ["/login", "/auth", "/cuenta/nueva-password"];

// Menú lateral: Entradas primero, luego Maestros
const ITEMS_LATERAL = [
  { href: "/", etiqueta: "Entradas", icono: IconoEntradas },
  { href: "/admin/maestros", etiqueta: "Maestros", icono: IconoMaestros },
];

// Menú superior (en móvil pasa a barra inferior): Entradas primero, luego Apartamentos
const ITEMS_SUPERIOR = [
  { href: "/", etiqueta: "Entradas", icono: IconoEntradas },
  { href: "/apartamentos", etiqueta: "Apartamentos", icono: IconoApartamentos },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ocultarNav = RUTAS_SIN_NAV.some((r) => pathname?.startsWith(r));

  if (ocultarNav) return <>{children}</>;

  async function salir() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function activo(href: string) {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  }

  return (
    <div className="flex min-h-screen">
      {/* Menú lateral */}
      <aside className="flex w-16 flex-col items-center border-r border-line bg-white py-6 sm:w-56 sm:items-stretch sm:px-4">
        <div className="mb-8 hidden px-2 font-display text-lg font-semibold sm:block">
          Apartamentos
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {ITEMS_LATERAL.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                activo(item.href)
                  ? "bg-ink text-paper"
                  : "text-ink/60 hover:bg-paper hover:text-ink"
              }`}
              title={item.etiqueta}
            >
              <item.icono />
              <span className="hidden sm:inline">{item.etiqueta}</span>
            </Link>
          ))}
        </nav>
        <button
          onClick={salir}
          className="mt-4 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-ink/40 hover:bg-paper hover:text-ink"
          title="Salir"
        >
          <IconoSalir />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Menú superior: en escritorio arriba, en móvil se oculta aquí y aparece abajo */}
        <header className="hidden border-b border-line bg-white px-6 py-3 md:block">
          <nav className="flex gap-2 text-sm">
            {ITEMS_SUPERIOR.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 ${
                  activo(item.href)
                    ? "bg-ink text-paper"
                    : "text-ink/60 hover:bg-paper hover:text-ink"
                }`}
              >
                {item.etiqueta}
              </Link>
            ))}
          </nav>
        </header>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>

        {/* Menú superior convertido en barra inferior en móvil */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white md:hidden">
          {ITEMS_SUPERIOR.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                activo(item.href) ? "text-ink" : "text-ink/40"
              }`}
            >
              <item.icono />
              {item.etiqueta}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function IconoEntradas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}

function IconoApartamentos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 21V9l8-6 8 6v12" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

function IconoMaestros() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
      <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}

function IconoSalir() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
