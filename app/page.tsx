import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EntradasView from "./entradas/EntradasView";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: apartamentos } = await supabase
    .from("apartamentos")
    .select("id, piso")
    .order("piso");

  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, nombre, codigo, created_at")
    .eq("activo", true)
    .order("nombre");

  const { data: origenes } = await supabase
    .from("origenes_reserva")
    .select("codigo, nombre")
    .order("nombre");

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold">Entradas</h1>
      <p className="mt-1 text-sm text-ink/60">
        Listado de todas las reservas, con sus huéspedes agrupados.
      </p>

      <div className="mt-8">
        <EntradasView
          apartamentos={apartamentos ?? []}
          clientes={clientes ?? []}
          origenes={origenes ?? []}
        />
      </div>
    </main>
  );
}
