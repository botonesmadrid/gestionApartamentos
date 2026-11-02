import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import IngresosView from "./IngresosView";

export default async function IngresosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clientes } = await supabase.from("clientes").select("id, codigo, nombre").order("nombre");
  const { data: origenes } = await supabase.from("origenes_reserva").select("codigo, nombre").order("nombre");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl font-semibold">Ingresos</h1>
      <p className="mt-1 text-sm text-ink/60">
        Una línea por servicio. Check-in, Limpieza y Gestión. Lo que viene de Entradas se genera solo; aquí se añade y ajusta el resto.
      </p>
      <div className="mt-6">
        <IngresosView clientes={clientes ?? []} origenes={origenes ?? []} />
      </div>
    </main>
  );
}
