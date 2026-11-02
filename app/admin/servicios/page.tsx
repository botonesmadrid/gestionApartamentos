import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ServiciosCliente from "./ServiciosCliente";

// Administración · Servicios por cliente: variables y reglas con las que se calculan los Ingresos
// (Check-in, Limpieza y Gestión). Solo gestores.
export default async function ServiciosPage({ searchParams }: { searchParams: { cliente?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
  if (perfil?.rol !== "gestor") redirect("/");

  const { data: clientes } = await supabase.from("clientes").select("id, codigo, nombre").eq("activo", true).order("nombre");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl font-semibold">Servicios por cliente</h1>
      <p className="mt-1 text-sm text-ink/60">
        Variables y reglas con las que se calculan los Ingresos de cada cliente. Los cambios se aplican a las líneas
        nuevas según su fecha; lo ya registrado no se modifica.
      </p>
      <div className="mt-6">
        <ServiciosCliente clientes={clientes ?? []} clienteInicial={searchParams.cliente} />
      </div>
    </main>
  );
}
