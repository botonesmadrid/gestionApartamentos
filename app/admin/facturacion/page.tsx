import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConfigFacturacion from "./ConfigFacturacion";

// Administración · Facturación: datos del emisor, plantilla del email y series de facturación por cliente.
export default async function ConfigFacturacionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
  if (perfil?.rol !== "gestor") redirect("/");
  const { data: clientes } = await supabase.from("clientes").select("id, codigo, nombre").order("nombre");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl font-semibold">Configuración de facturación</h1>
      <p className="mt-1 text-sm text-ink/60">
        Datos que aparecen en las facturas, plantilla del correo con el que se envían y qué factura se genera cada mes para
        cada cliente. Los emails de destino se configuran en Maestros → Clientes.
      </p>
      <div className="mt-6">
        <ConfigFacturacion clientes={clientes ?? []} />
      </div>
    </main>
  );
}
