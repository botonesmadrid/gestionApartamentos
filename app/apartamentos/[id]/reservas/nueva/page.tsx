import Link from "next/link";
import { crearReserva } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export default async function NuevaReservaPage({
  params,
}: {
  params: { id: string };
}) {
  const accion = crearReserva.bind(null, params.id);

  const supabase = createClient();
  const { data: origenes } = await supabase
    .from("origenes_reserva")
    .select("codigo, nombre")
    .order("nombre");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href={`/apartamentos/${params.id}`}
        className="text-sm text-ink/50 hover:text-ink"
      >
        ← Volver al apartamento
      </Link>

      <h1 className="mt-2 font-display text-3xl font-semibold">Nueva reserva</h1>

      <form action={accion} className="mt-8 grid grid-cols-2 gap-3">
        <div className="col-span-2 grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="nombre">Nombre</label>
            <input id="nombre" name="nombre" required />
          </div>
          <div>
            <label htmlFor="apellido1">1er apellido</label>
            <input id="apellido1" name="apellido1" />
          </div>
          <div>
            <label htmlFor="apellido2">2º apellido</label>
            <input id="apellido2" name="apellido2" />
          </div>
        </div>

        <div>
          <label htmlFor="fecha_reserva">Fecha de reserva</label>
          <input id="fecha_reserva" name="fecha_reserva" type="date" />
        </div>
        <div>
          <label htmlFor="fecha_pago">Fecha de pago</label>
          <input id="fecha_pago" name="fecha_pago" type="date" />
        </div>
        <div>
          <label htmlFor="fecha_entrada">Entrada</label>
          <input id="fecha_entrada" name="fecha_entrada" type="date" required />
        </div>
        <div>
          <label htmlFor="fecha_salida">Salida</label>
          <input id="fecha_salida" name="fecha_salida" type="date" required />
        </div>

        <div>
          <label htmlFor="importe">Importe (€)</label>
          <input id="importe" name="importe" type="number" step="0.01" />
        </div>
        <div>
          <label htmlFor="comision_portal">Comisión portal (€)</label>
          <input id="comision_portal" name="comision_portal" type="number" step="0.01" />
        </div>

        <div>
          <label htmlFor="origen_codigo">Origen de la reserva</label>
          <select id="origen_codigo" name="origen_codigo" defaultValue="">
            <option value="" disabled>
              Selecciona…
            </option>
            {origenes?.map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="codigo_reserva">Código de reserva</label>
          <input id="codigo_reserva" name="codigo_reserva" />
        </div>
        <div>
          <label htmlFor="forma_pago">Forma de pago</label>
          <input id="forma_pago" name="forma_pago" />
        </div>

        <button
          type="submit"
          className="col-span-2 mt-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90"
        >
          Guardar reserva
        </button>
      </form>
    </main>
  );
}
