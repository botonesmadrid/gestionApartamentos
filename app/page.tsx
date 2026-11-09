import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import EntradasView from "./entradas/EntradasView";
import CalendarioEntradas from "./entradas/CalendarioEntradas";

// Entradas: pestañas Lista (por defecto) y Calendario (?vista=calendario).
export default async function Home(props: { searchParams: Promise<{ vista?: string }> }) {
  const searchParams = await props.searchParams;
  const calendario = searchParams.vista === "calendario";
  const supabase = await createClient();
  // En paralelo: la sesión y los datos (que ya protegen RLS y la verificación en dos pasos).
  const [
    {
      data: { user },
    },
    { data: apartamentos },
    { data: clientes },
    { data: origenes },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("apartamentos").select("id, piso, cliente_id").order("piso"),
    supabase.from("clientes").select("id, nombre, codigo, created_at, color_calendario").eq("activo", true).order("nombre"),
    supabase.from("origenes_reserva").select("codigo, nombre").order("nombre"),
  ]);
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold">Entradas</h1>
      <p className="mt-1 text-sm text-ink/60">
        Listado de todas las reservas, con sus huéspedes agrupados.
      </p>

      <nav className="mt-6 flex gap-1 border-b border-line text-sm" aria-label="Vistas de entradas">
        {[
          { href: "/", texto: "Lista", activa: !calendario },
          { href: "/?vista=calendario", texto: "Calendario", activa: calendario },
        ].map((t) => (
          <Link
            key={t.texto}
            href={t.href}
            className={`-mb-px border-b-2 px-4 py-2 ${t.activa ? "border-ink font-medium text-ink" : "border-transparent text-ink/50 hover:text-ink"}`}
          >
            {t.texto}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {calendario ? (
          <CalendarioEntradas apartamentos={apartamentos ?? []} clientes={clientes ?? []} />
        ) : (
          <EntradasView
            apartamentos={apartamentos ?? []}
            clientes={clientes ?? []}
            origenes={origenes ?? []}
          />
        )}
      </div>
    </main>
  );
}
