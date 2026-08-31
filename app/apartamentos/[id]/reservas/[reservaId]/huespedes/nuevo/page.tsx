import Link from "next/link";
import { crearHuesped } from "@/app/actions";

export default function NuevoHuespedPage({
  params,
}: {
  params: { id: string; reservaId: string };
}) {
  const accion = crearHuesped.bind(null, params.id, params.reservaId);

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
          <label htmlFor="sexo">Sexo</label>
          <input id="sexo" name="sexo" />
        </div>

        <div>
          <label htmlFor="tipo_documento">Tipo de documento</label>
          <input id="tipo_documento" name="tipo_documento" placeholder="DNI, Pasaporte…" />
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
          <label htmlFor="nacionalidad">Nacionalidad</label>
          <input id="nacionalidad" name="nacionalidad" />
        </div>
        <div>
          <label htmlFor="pais">País</label>
          <input id="pais" name="pais" />
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
