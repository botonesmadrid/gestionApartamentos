import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FacturacionView from "./FacturacionView";

export default async function FacturacionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clientes } = await supabase.from("clientes").select("id, codigo, nombre").order("nombre");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl font-semibold">Facturación</h1>
      <p className="mt-1 text-sm text-ink/60">
        Facturas por periodo y cliente generadas desde Ingresos, con su detalle de reservas. Histórico de facturas emitidas
        y envío por email.
      </p>
      <div className="mt-6">
        <FacturacionView clientes={clientes ?? []} />
      </div>
    </main>
  );
}
