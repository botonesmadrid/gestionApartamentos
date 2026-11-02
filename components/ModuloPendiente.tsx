import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Página provisional para los módulos que aún no están construidos.
export default async function ModuloPendiente({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl font-semibold">{titulo}</h1>
      <p className="mt-1 text-sm text-ink/60">{descripcion}</p>
      <div className="mt-8 rounded-lg border border-dashed border-line bg-white px-6 py-12 text-center text-sm text-ink/50">
        Este módulo está en preparación.
      </div>
    </main>
  );
}
