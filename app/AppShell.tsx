"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ACCIONES, filtrarAccion, type Accion } from "@/lib/acciones";

const RUTAS_SIN_NAV = ["/login", "/auth", "/cuenta/nueva-password", "/f/"];

// Menú lateral: Entradas primero, luego Ingresos y Maestros
const ITEMS_LATERAL = [
  { href: "/", etiqueta: "Entradas", icono: IconoEntradas },
  { href: "/ingresos", etiqueta: "Ingresos", icono: IconoIngresos },
  { href: "/admin/maestros", etiqueta: "Maestros", icono: IconoMaestros },
];


// Nº de reservas por tipo de acción pendiente (mismos criterios que el filtro del listado).
function usePendientes(activo: boolean, pathname: string | null) {
  const [cuentas, setCuentas] = useState<Partial<Record<Accion, number>>>({});
  useEffect(() => {
    if (!activo) return;
    const supabase = createClient();
    async function contar() {
      const resultados = await Promise.all(
        ACCIONES.map(async (a) => {
          const { count } = await filtrarAccion(
            supabase.from("reservas").select("id", { count: "exact", head: true }),
            a.clave,
          );
          return [a.clave, count ?? 0] as const;
        }),
      );
      setCuentas(Object.fromEntries(resultados));
    }
    contar();
    window.addEventListener("pendientes-cambiados", contar);
    return () => window.removeEventListener("pendientes-cambiados", contar);
  }, [activo, pathname]);
  return cuentas;
}

// Abre el listado de Entradas filtrado por una acción. Si ya estamos en Entradas, sin recargar.
function irAAccion(e: React.MouseEvent, pathname: string | null, accion: Accion) {
  if (pathname !== "/") return; // el enlace normal navega y el listado lee ?accion=
  e.preventDefault();
  window.history.pushState(null, "", `/?accion=${accion}`);
  window.dispatchEvent(new CustomEvent("filtro-accion", { detail: accion }));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ocultarNav = RUTAS_SIN_NAV.some((r) => pathname?.startsWith(r));
  const pendientes = usePendientes(!ocultarNav, pathname);
  const [panelPendientes, setPanelPendientes] = useState(false);
  const totalPendientes = Object.values(pendientes).reduce((n, x) => n + (x ?? 0), 0);

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
      <aside className="hidden w-56 flex-col items-stretch border-r border-line bg-white px-4 py-6 md:flex">
        <Link href="/" className="mb-8 flex justify-center px-2 sm:justify-start">
          <Image
            src="/logo-botones.jpg"
            alt="Botones"
            width={40}
            height={40}
            className="rounded"
            priority
          />
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {ITEMS_LATERAL.map((item) => (
            <div key={item.href}>
            <Link
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
            {item.href === "/" && (
              <ul className="mb-2 mt-1 space-y-0.5 sm:ml-3 sm:border-l sm:border-line sm:pl-2">
                {ACCIONES.filter((a) => (pendientes[a.clave] ?? 0) > 0).map((a) => (
                  <li key={a.clave}>
                    <Link
                      href={`/?accion=${a.clave}`}
                      onClick={(e) => irAAccion(e, pathname, a.clave)}
                      title={`${pendientes[a.clave]} · ${a.ayuda}`}
                      className="flex items-center justify-center gap-2 rounded-md px-2 py-1 text-xs text-ink/70 hover:bg-amber-50 hover:text-ink sm:justify-between"
                    >
                      <span className="hidden truncate sm:inline">{a.etiqueta}</span>
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">
                        {pendientes[a.clave]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            </div>
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
        <main className="min-w-0 flex-1 pb-24 md:pb-0">{children}</main>

        {/* Móvil: barra inferior tipo app (con margen para la zona segura del iPhone) */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white/95 backdrop-blur md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <Link
            href="/"
            onClick={() => setPanelPendientes(false)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${pathname === "/" ? "text-ink" : "text-ink/45"}`}
          >
            <IconoEntradas />
            Entradas
          </Link>
          <button
            type="button"
            onClick={() => setPanelPendientes((v) => !v)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${panelPendientes ? "text-ink" : "text-ink/45"}`}
          >
            <IconoPendientes />
            Pendientes
            {totalPendientes > 0 && (
              <span className="absolute right-[calc(50%-1.4rem)] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                {totalPendientes}
              </span>
            )}
          </button>
          <Link
            href="/ingresos"
            onClick={() => setPanelPendientes(false)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${pathname?.startsWith("/ingresos") ? "text-ink" : "text-ink/45"}`}
          >
            <IconoIngresos />
            Ingresos
          </Link>
          <Link
            href="/admin/maestros"
            onClick={() => setPanelPendientes(false)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${pathname?.startsWith("/admin/maestros") ? "text-ink" : "text-ink/45"}`}
          >
            <IconoMaestros />
            Maestros
          </Link>
          <button type="button" onClick={salir} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-ink/45">
            <IconoSalir />
            Salir
          </button>
        </nav>

        {/* Móvil: panel de pendientes por tipo de acción */}
        {panelPendientes && (
          <div className="fixed inset-0 z-30 bg-ink/30 md:hidden" onClick={() => setPanelPendientes(false)}>
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white px-4 pt-3 shadow-xl"
              style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/50">Pendientes</p>
              {totalPendientes === 0 ? (
                <p className="py-4 text-sm text-ink/50">No hay nada pendiente. 🎉</p>
              ) : (
                <ul className="divide-y divide-line">
                  {ACCIONES.filter((a) => (pendientes[a.clave] ?? 0) > 0).map((a) => (
                    <li key={a.clave}>
                      <Link
                        href={`/?accion=${a.clave}`}
                        onClick={(e) => {
                          setPanelPendientes(false);
                          irAAccion(e, pathname, a.clave);
                        }}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <span>
                          <span className="block text-sm font-medium">{a.etiqueta}</span>
                          <span className="block text-xs text-ink/50">{a.ayuda}</span>
                        </span>
                        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 px-2 text-xs font-semibold text-white">
                          {pendientes[a.clave]}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
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

function IconoPendientes() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3a7 7 0 0 0-7 7v3.5L3.5 16h17L19 13.5V10a7 7 0 0 0-7-7Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function IconoIngresos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
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
