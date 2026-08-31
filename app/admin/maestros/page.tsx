import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MAESTROS } from "./config";

export default async function MaestrosIndexPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  if (perfil?.rol !== "gestor") {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">Administración de maestros</h1>
        <Link href="/" className="text-sm text-ink/50 hover:text-ink">
          ← Volver
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink/60">
        Consulta, edita y añade valores de los catálogos usados en toda la app.
      </p>

      <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MAESTROS.map((m) => (
          <li key={m.slug}>
            <Link
              href={`/admin/maestros/${m.slug}`}
              className="block rounded-lg border border-line bg-white px-4 py-3 hover:bg-paper"
            >
              <span className="font-medium">{m.titulo}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
