import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ReservaPage({
  params,
}: {
  params: { id: string; reservaId: string };
}) {
  const supabase = createClient();

  const { data: reserva } = await supabase
    .from("reservas")
    .select("*")
    .eq("id", params.reservaId)
    .single();

  if (!reserva) notFound();

  const { data: huespedes } = await supabase
    .from("huespedes")
    .select("id, nombre, apellido1, tipo_documento, numero_documento, nacionalidad")
    .eq("reserva_id", params.reservaId)
    .order("created_at");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href={`/apartamentos/${params.id}`}
        className="text-sm text-ink/50 hover:text-ink"
      >
        ← Volver al apartamento
      </Link>

      <h1 className="mt-2 font-display text-3xl font-semibold">
        {reserva.nombre} {reserva.apellido1}
      </h1>
      <p className="mt-1 text-sm text-ink/60">
        {reserva.fecha_entrada} → {reserva.fecha_salida} · {reserva.duracion} noches
        {reserva.origen_reserva ? ` · ${reserva.origen_reserva}` : ""}
      </p>
      {reserva.importe && (
        <p className="mt-1 text-sm text-ink/60">
          {reserva.importe} € {reserva.comision_portal ? `(comisión: ${reserva.comision_portal} €)` : ""}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Huéspedes</h2>
        <Link
          href={`/apartamentos/${params.id}/reservas/${params.reservaId}/huespedes/nuevo`}
          className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/90"
        >
          + Añadir huésped
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-white">
        {huespedes?.length ? (
          huespedes.map((h) => (
            <li key={h.id} className="flex items-center justify-between px-4 py-3">
              <span className="font-medium">
                {h.nombre} {h.apellido1}
              </span>
              <span className="text-sm text-ink/40">
                {[h.tipo_documento, h.numero_documento, h.nacionalidad]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))
        ) : (
          <li className="px-4 py-6 text-sm text-ink/50">
            Sin huéspedes registrados en esta reserva.
          </li>
        )}
      </ul>
    </main>
  );
}
