import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GastosView from "./GastosView";

export default async function GastosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl font-semibold">Gastos</h1>
      <p className="mt-1 text-sm text-ink/60">
        Libro de facturas recibidas y emitidas, y resumen trimestral de IVA calculado a partir de él.
      </p>
      <div className="mt-6">
        <GastosView />
      </div>
    </main>
  );
}
