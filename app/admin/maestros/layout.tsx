import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MAESTROS } from "./config";
import PestanasMaestros from "./PestanasMaestros";

export default async function MaestrosLayout({ children }: { children: React.ReactNode }) {
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
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold">Maestros</h1>
      <p className="mt-1 text-sm text-ink/60">
        Consulta, edita y añade valores de los catálogos usados en toda la app.
      </p>

      <div className="mt-6">
        <PestanasMaestros pestanas={MAESTROS.map(({ slug, titulo }) => ({ slug, titulo }))} />
      </div>

      <div className="mt-6">{children}</div>
    </main>
  );
}
