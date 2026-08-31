import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ApartamentoPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: apartamento } = await supabase
    .from("apartamentos")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!apartamento) notFound();

  const { data: reservas } = await supabase
    .from("reservas")
    .select("id, nombre, apellido1, fecha_entrada, fecha_salida, origen_reserva, importe")
    .eq("apartamento_id", params.id)
    .order("fecha_entrada", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm text-ink/50 hover:text-ink">
        ← Todos los apartamentos
      </Link>

      <h1 className="mt-2 font-display text-3xl font-semibold">
        {apartamento.apartamento}
      </h1>
      <p className="mt-1 text-sm text-ink/60">
        {[apartamento.piso, apartamento.cliente].filter(Boolean).join(" · ")}
      </p>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Reservas</h2>
        <Link
          href={`/apartamentos/${params.id}/reservas/nueva`}
          className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/90"
        >
          + Nueva reserva
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-white">
        {reservas?.length ? (
          reservas.map((r) => (
            <li key={r.id}>
              <Link
                href={`/apartamentos/${params.id}/reservas/${r.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-paper"
              >
                <span>
                  <span className="font-medium">
                    {r.nombre} {r.apellido1}
                  </span>
                  <span className="ml-2 text-sm text-ink/50">
                    {r.fecha_entrada} → {r.fecha_salida}
                  </span>
                </span>
                <span className="text-sm text-ink/40">
                  {r.origen_reserva}
                  {r.importe ? ` · ${r.importe} €` : ""}
                </span>
              </Link>
            </li>
          ))
        ) : (
          <li className="px-4 py-6 text-sm text-ink/50">
            Sin reservas todavía en este apartamento.
          </li>
        )}
      </ul>
    </main>
  );
}
