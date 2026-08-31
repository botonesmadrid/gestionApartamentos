import { createClient } from "@/lib/supabase/server";
import { crearApartamento, cerrarSesion } from "./actions";
import Link from "next/link";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: apartamentos } = await supabase
    .from("apartamentos")
    .select("id, apartamento, piso, clientes(nombre)")
    .order("apartamento");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Tus apartamentos</h1>
          <p className="mt-1 text-sm text-ink/60">{user?.email}</p>
        </div>
        <form action={cerrarSesion}>
          <button className="text-sm text-ink/50 hover:text-ink">Salir</button>
        </form>
      </div>

      <ul className="mt-8 divide-y divide-line rounded-lg border border-line bg-white">
        {apartamentos?.length ? (
          apartamentos.map((a) => (
            <li key={a.id}>
              <Link
                href={`/apartamentos/${a.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-paper"
              >
                <span>
                  <span className="font-medium">{a.apartamento}</span>
                  {a.piso && <span className="text-ink/50"> · {a.piso}</span>}
                </span>
                <span className="text-sm text-ink/40">{a.clientes?.[0]?.nombre ?? ""}</span>
              </Link>
            </li>
          ))
        ) : (
          <li className="px-4 py-6 text-sm text-ink/50">
            Todavía no tienes apartamentos dados de alta.
          </li>
        )}
      </ul>

      <details className="mt-8 rounded-lg border border-line bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">
          + Añadir apartamento
        </summary>
        <form action={crearApartamento} className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label htmlFor="apartamento">Nombre / identificador</label>
            <input id="apartamento" name="apartamento" required placeholder="Ático Sol" />
          </div>
          <div>
            <label htmlFor="piso">Piso</label>
            <input id="piso" name="piso" placeholder="3ºB" />
          </div>
          <div>
            <label htmlFor="cliente">Cliente / propietario</label>
            <input id="cliente" name="cliente" />
          </div>
          <div>
            <label htmlFor="codigo_establecimiento">Código de establecimiento</label>
            <input id="codigo_establecimiento" name="codigo_establecimiento" />
          </div>
          <div>
            <label htmlFor="num_registro">Nº de registro</label>
            <input id="num_registro" name="num_registro" />
          </div>
          <div className="col-span-2">
            <label htmlFor="cru">CRU</label>
            <input id="cru" name="cru" />
          </div>
          <button
            type="submit"
            className="col-span-2 mt-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90"
          >
            Guardar apartamento
          </button>
        </form>
      </details>
    </main>
  );
}
