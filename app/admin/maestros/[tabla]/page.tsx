import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarMaestro } from "../config";
import MaestroCrud from "../MaestroCrud";

export default async function MaestroPage({ params }: { params: { tabla: string } }) {
  const config = buscarMaestro(params.tabla);
  if (!config) notFound();

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
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">{config.titulo}</h1>
        <Link href="/admin/maestros" className="text-sm text-ink/50 hover:text-ink">
          ← Todos los maestros
        </Link>
      </div>

      <div className="mt-8">
        <MaestroCrud config={config} />
      </div>
    </main>
  );
}
