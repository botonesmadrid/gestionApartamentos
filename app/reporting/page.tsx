import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReportingView from "./ReportingView";

export default async function ReportingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: clientes } = await supabase.from("clientes").select("id, codigo, nombre, pisos_ocupacion").eq("activo", true).order("nombre");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl font-semibold">Reporting</h1>
      <p className="mt-1 text-sm text-ink/60">
        Informe anual de KPIs con su presentación trimestral, y análisis de entradas y de facturación.
      </p>
      <div className="mt-6">
        <ReportingView clientes={clientes ?? []} />
      </div>
    </main>
  );
}
