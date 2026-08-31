import Link from "next/link";
import { crearHuesped } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export default async function NuevoHuespedPage({
  params,
}: {
  params: { id: string; reservaId: string };
}) {
  const accion = crearHuesped.bind(null, params.id, params.reservaId);

  const supabase = createClient();
  const { data: tiposDocumento } = await supabase
    .from("tipos_documento")
    .select("codigo, descripcion")
    .order("codigo");

  const { data: paises } = await supabase
    .from("paises")
    .select("codigo, nombre")
    .order("nombre");

  const { data: sexos } = await supabase
    .from("sexos")
    .select("codigo, descripcion")
    .order("codigo");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href={`/apartamentos/${params.id}/reservas/${params.reservaId}`}
        className="text-sm text-ink/50 hover:text-ink"
      >
        ← Volver a la reserva
      </Link>

      <h1 className="mt-2 font-display text-3xl font-semibold">Nuevo huésped</h1>

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
          <label htmlFor="fecha_nacimiento">Fecha de nacimiento</label>
          <input id="fecha_nacimiento" name="fecha_nacimiento" type="date" />
        </div>
        <div>
          <label htmlFor="sexo_codigo">Sexo</label>
          <select id="sexo_codigo" name="sexo_codigo" defaultValue="">
            <option value="" disabled>
              Selecciona…
            </option>
            {sexos?.map((s) => (
              <option key={s.codigo} value={s.codigo}>
                {s.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tipo_documento_codigo">Tipo de documento</label>
          <select id="tipo_documento_codigo" name="tipo_documento_codigo" defaultValue="">
            <option value="" disabled>
              Selecciona…
            </option>
            {tiposDocumento?.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.descripcion}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="soporte_documento">Soporte del documento</label>
          <input id="soporte_documento" name="soporte_documento" />
        </div>
        <div className="col-span-2">
          <label htmlFor="numero_documento">Número de documento</label>
          <input id="numero_documento" name="numero_documento" />
        </div>

        <div>
          <label htmlFor="nacionalidad_codigo">Nacionalidad</label>
          <select id="nacionalidad_codigo" name="nacionalidad_codigo" defaultValue="">
            <option value="" disabled>
              Selecciona…
            </option>
            {paises?.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pais_codigo">País (residencia)</label>
          <select id="pais_codigo" name="pais_codigo" defaultValue="">
            <option value="" disabled>
              Selecciona…
            </option>
            {paises?.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <label htmlFor="direccion">Dirección</label>
          <input id="direccion" name="direccion" />
        </div>
        <div>
          <label htmlFor="codigo_postal">Código postal</label>
          <input id="codigo_postal" name="codigo_postal" />
        </div>
        <div>
          <label htmlFor="nombre_municipio">Municipio</label>
          <input id="nombre_municipio" name="nombre_municipio" />
        </div>
        <div>
          <label htmlFor="codigo_municipio">Código de municipio</label>
          <input id="codigo_municipio" name="codigo_municipio" />
        </div>

        <div>
          <label htmlFor="telefono">Teléfono</label>
          <input id="telefono" name="telefono" type="tel" />
        </div>
        <div>
          <label htmlFor="correo">Correo</label>
          <input id="correo" name="correo" type="email" />
        </div>

        <div>
          <label htmlFor="rol">Rol</label>
          <input id="rol" name="rol" placeholder="Titular, acompañante…" />
        </div>
        <div>
          <label htmlFor="parentesco">Parentesco</label>
          <input id="parentesco" name="parentesco" />
        </div>

        <button
          type="submit"
          className="col-span-2 mt-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90"
        >
          Guardar huésped
        </button>
      </form>
    </main>
  );
}
