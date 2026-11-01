import { createClient } from "@/lib/supabase/server";
import { crearApartamento } from "../actions";
import Link from "next/link";

export default async function ApartamentosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: apartamentos } = await supabase
    .from("apartamentos")
    .select("id, piso, clientes(nombre)")
    .order("piso");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div>
        <h1 className="font-display text-3xl font-semibold">Tus apartamentos</h1>
        <p className="mt-1 text-sm text-ink/60">{user?.email}</p>
      </div>

      <ul className="mt-8 divide-y divide-line rounded-lg border border-line bg-white">
        {apartamentos?.length ? (
          apartamentos.map((a) => (
            <li key={a.id}>
              <Link
                href={`/apartamentos/${a.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-paper"
              >
                <span className="font-medium">{a.piso}</span>
                <span className="text-sm text-ink/40">{(a.clientes as unknown as { nombre: string } | null)?.nombre ?? ""}</span>
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
          <div>
            <label htmlFor="piso">Piso</label>
            <input id="piso" name="piso" required placeholder="3ºB" />
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
