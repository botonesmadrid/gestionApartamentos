"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ACCIONES, filtrarAccion, type Accion } from "@/lib/acciones";

const RUTAS_SIN_NAV = ["/login", "/auth", "/cuenta/nueva-password", "/cuenta/verificacion", "/f/", "/registro"];

// Módulos de la app: barra inferior en móvil, barra superior en escritorio y también en el menú lateral.
const MODULOS = [
  { href: "/", etiqueta: "Entradas", icono: IconoEntradas },
  { href: "/ingresos", etiqueta: "Ingresos", icono: IconoIngresos },
  { href: "/gastos", etiqueta: "Gastos", icono: IconoGastos },
  { href: "/facturacion", etiqueta: "Facturación", icono: IconoFacturacion },
  { href: "/reporting", etiqueta: "Reporting", icono: IconoReporting },
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
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Menú lateral fijo (pantallas grandes): se puede esconder; se recuerda en este navegador.
  const [lateralVisible, setLateralVisible] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("menu-lateral") === "oculto") setLateralVisible(false);
    } catch {}
  }, []);
  function alternarMenu() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setLateralVisible((v) => {
        try {
          localStorage.setItem("menu-lateral", v ? "oculto" : "visible");
        } catch {}
        return !v;
      });
    } else {
      setMenuAbierto(true);
    }
  }
  const totalPendientes = Object.values(pendientes).reduce((n, x) => n + (x ?? 0), 0);

  // Al navegar se cierra el menú lateral desplegable.
  useEffect(() => setMenuAbierto(false), [pathname]);

  if (ocultarNav) return <>{children}</>;

  async function salir() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function activo(href: string) {
    if (href === "/") return pathname === "/";
    return !!pathname?.startsWith(href);
  }

  // Contenido del menú lateral: módulos, filtros de acciones bajo Entradas y administración.
  const menuLateral = (
    <div className="flex h-full flex-col">
      <nav className="flex flex-1 flex-col gap-1">
        {MODULOS.map((item) => (
          <div key={item.href}>
            <Link
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                activo(item.href) ? "bg-ink text-paper" : "text-ink/60 hover:bg-paper hover:text-ink"
              }`}
            >
              <item.icono />
              <span>{item.etiqueta}</span>
            </Link>
            {item.href === "/" && (
              <ul className="mb-2 ml-3 mt-1 space-y-0.5 border-l border-line pl-2">
                {ACCIONES.map((a) => {
                  const n = pendientes[a.clave] ?? 0;
                  return (
                    <li key={a.clave}>
                      <Link
                        href={`/?accion=${a.clave}`}
                        onClick={(e) => {
                          setMenuAbierto(false);
                          irAAccion(e, pathname, a.clave);
                        }}
                        title={a.ayuda}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs text-ink/70 hover:bg-amber-50 hover:text-ink"
                      >
                        <span className="truncate">{a.etiqueta}</span>
                        <span
                          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                            n > 0 ? "bg-amber-500 text-white" : "bg-paper text-ink/40"
                          }`}
                        >
                          {n}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}

        <p className="mb-1 mt-5 px-3 text-[11px] font-medium uppercase tracking-wide text-ink/40">Administración</p>
        <Link
          href="/admin/maestros"
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
            activo("/admin/maestros") ? "bg-ink text-paper" : "text-ink/60 hover:bg-paper hover:text-ink"
          }`}
        >
          <IconoMaestros />
          <span>Maestros</span>
        </Link>
        <Link
          href="/admin/servicios"
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
            activo("/admin/servicios") ? "bg-ink text-paper" : "text-ink/60 hover:bg-paper hover:text-ink"
          }`}
        >
          <IconoServicios />
          <span>Servicios por cliente</span>
        </Link>
        <Link
          href="/admin/facturacion"
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
            activo("/admin/facturacion") ? "bg-ink text-paper" : "text-ink/60 hover:bg-paper hover:text-ink"
          }`}
        >
          <IconoFacturacion />
          <span>Facturación</span>
        </Link>
      </nav>
      <button
        onClick={salir}
        className="mt-4 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-ink/40 hover:bg-paper hover:text-ink"
      >
        <IconoSalir />
        <span>Salir</span>
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Menú lateral fijo en pantallas grandes (se esconde con el botón ☰ de la barra superior) */}
      {lateralVisible && (
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-white px-4 pb-6 lg:flex">
          <Link href="/" className="flex h-14 shrink-0 items-center px-2">
            <Image src="/logo-botones.jpg" alt="Botones" width={32} height={32} className="rounded" priority />
          </Link>
          <div className="mt-4 flex-1">{menuLateral}</div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
      {/* Cabecera: en escritorio lleva los módulos (a la derecha del menú lateral); en móvil, el botón del menú */}
      <header
        className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-white/95 px-3 backdrop-blur md:px-4"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <button
          type="button"
          onClick={alternarMenu}
          aria-label={lateralVisible ? "Esconder o abrir el menú" : "Mostrar el menú"}
          title="Menú"
          className="relative -ml-1 rounded-md p-2 text-ink/70 hover:bg-paper"
        >
          <IconoMenu />
          {totalPendientes > 0 && (
            <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500" />
          )}
        </button>
        <Link href="/" className={`flex shrink-0 items-center py-2 ${lateralVisible ? "lg:hidden" : ""}`}>
          <Image src="/logo-botones.jpg" alt="Botones" width={32} height={32} className="rounded" priority />
        </Link>
        <span className="text-sm font-medium md:hidden">
          {MODULOS.find((m) => activo(m.href))?.etiqueta ??
            (activo("/admin/maestros")
              ? "Maestros"
              : activo("/admin/servicios")
                ? "Servicios por cliente"
                : activo("/admin/facturacion")
                  ? "Config. facturación"
                  : "")}
        </span>
        <nav className="hidden h-14 items-stretch gap-1 overflow-x-auto md:flex">
          {MODULOS.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={`relative flex items-center gap-2 border-b-2 px-3 text-sm ${
                activo(m.href) ? "border-ink font-medium text-ink" : "border-transparent text-ink/55 hover:text-ink"
              }`}
            >
              <m.icono />
              {m.etiqueta}
              {m.href === "/" && totalPendientes > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">
                  {totalPendientes}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </header>

        <main className="min-w-0 flex-1 pb-24 md:pb-0">{children}</main>
      </div>

      {/* Menú lateral desplegable (móvil y tablet) */}
      {menuAbierto && (
        <div className="fixed inset-0 z-50 bg-ink/30 lg:hidden" onClick={() => setMenuAbierto(false)}>
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-white px-4 shadow-xl"
            style={{
              paddingTop: "calc(1.25rem + env(safe-area-inset-top))",
              paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {menuLateral}
          </div>
        </div>
      )}

      {/* Móvil: barra inferior con los módulos (con margen para la zona segura del iPhone) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {MODULOS.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
              activo(m.href) ? "text-ink" : "text-ink/45"
            }`}
          >
            <m.icono />
            {m.etiqueta}
            {m.href === "/" && totalPendientes > 0 && (
              <span className="absolute right-[calc(50%-1.4rem)] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                {totalPendientes}
              </span>
            )}
          </Link>
        ))}
      </nav>
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

function IconoMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function IconoGastos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </svg>
  );
}

function IconoFacturacion() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M14 2v6h6M9 13h7M9 17h7" />
    </svg>
  );
}

function IconoReporting() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v9l7.5 4.5" />
      <circle cx="12" cy="12" r="9" />
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

function IconoServicios() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
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
