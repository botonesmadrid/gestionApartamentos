"use client";

// Acciones sobre entradas: combinar una entrada con otra (la destino conserva su información y el titular de la
// origen pasa a ser huésped de la destino), mover huéspedes a otra entrada y eliminar entradas.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Candidata = {
  id: string;
  fecha_entrada: string;
  fecha_salida: string;
  nombre: string;
  apellido1: string | null;
  num_huespedes: number | null;
  apartamentos: { piso: string } | null;
};

const fecha = (iso: string) => iso.split("-").reverse().join("/");
const sumarDias = (iso: string, d: number) => {
  const x = new Date(iso + "T12:00:00");
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

// Selector de la entrada destino: por defecto, las que entran ±3 días alrededor de la fecha de referencia;
// buscando por nombre, cualquiera.
function SelectorEntrada({
  excluirId,
  fechaRef,
  onElegir,
}: {
  excluirId: string;
  fechaRef: string;
  onElegir: (c: Candidata) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [texto, setTexto] = useState("");
  const [lista, setLista] = useState<Candidata[] | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      let q = supabase
        .from("reservas")
        .select("id, fecha_entrada, fecha_salida, nombre, apellido1, num_huespedes, apartamentos(piso)")
        .neq("id", excluirId)
        .neq("estado", "cancelada")
        .order("fecha_entrada")
        .limit(40);
      const b = texto.trim().replace(/[%,()]/g, " ");
      if (b) q = q.or(`nombre.ilike.%${b}%,apellido1.ilike.%${b}%,apellido2.ilike.%${b}%,codigo_reserva.ilike.%${b}%`);
      else q = q.gte("fecha_entrada", sumarDias(fechaRef, -3)).lte("fecha_entrada", sumarDias(fechaRef, 3));
      const { data } = await q;
      setLista((data as unknown as Candidata[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [supabase, texto, excluirId, fechaRef]);

  return (
    <div>
      <input type="search" placeholder="Buscar por titular o código…" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <p className="mt-1 text-xs text-ink/50">
        {texto.trim() ? "Resultados de la búsqueda" : `Entradas que llegan entre el ${fecha(sumarDias(fechaRef, -3))} y el ${fecha(sumarDias(fechaRef, 3))}`}
      </p>
      <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
        {lista === null ? (
          <li className="px-3 py-2 text-sm text-ink/40">Buscando…</li>
        ) : lista.length === 0 ? (
          <li className="px-3 py-2 text-sm text-ink/40">No hay entradas.</li>
        ) : (
          lista.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onElegir(c)} className="w-full px-3 py-2 text-left text-sm hover:bg-paper">
                <span className="font-medium">
                  {c.nombre} {c.apellido1 ?? ""}
                </span>
                <span className="block text-xs text-ink/50">
                  {c.apartamentos?.piso ?? "—"} · {fecha(c.fecha_entrada)} → {fecha(c.fecha_salida)}
                  {c.num_huespedes ? ` · ${c.num_huespedes} huésp.` : ""}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// Combinar esta entrada (origen) con otra (destino) y eliminar entrada.
export function AccionesEntrada({
  reserva,
  onHecho,
}: {
  reserva: { id: string; nombre: string; apellido1: string | null; fecha_entrada: string };
  onHecho: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [modo, setModo] = useState<"" | "combinar">("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const titular = `${reserva.nombre} ${reserva.apellido1 ?? ""}`.trim();

  async function combinar(destino: Candidata) {
    const nombreDestino = `${destino.nombre} ${destino.apellido1 ?? ""}`.trim();
    if (
      !window.confirm(
        `¿Combinar la entrada de ${titular} con la de ${nombreDestino} (${destino.apartamentos?.piso ?? "—"}, ${fecha(destino.fecha_entrada)})?\n\n` +
          `La entrada de ${nombreDestino} conserva toda su información. ${titular} y sus huéspedes pasan a ser huéspedes de esa entrada, y la entrada de ${titular} desaparece.`,
      )
    )
      return;
    setOcupado(true);
    setError("");
    const { error: err } = await supabase.rpc("fusionar_reservas", { p_origen: reserva.id, p_destino: destino.id });
    setOcupado(false);
    if (err) return setError(err.message);
    window.dispatchEvent(new Event("pendientes-cambiados"));
    onHecho();
  }

  async function eliminar() {
    if (!window.confirm(`¿Eliminar la entrada de ${titular}? Se borran también sus huéspedes y sus líneas de Ingresos. No se puede deshacer.`)) return;
    setOcupado(true);
    setError("");
    const { error: err } = await supabase.rpc("eliminar_reserva", { p_reserva: reserva.id });
    setOcupado(false);
    if (err) return setError(err.message);
    window.dispatchEvent(new Event("pendientes-cambiados"));
    onHecho();
  }

  return (
    <div className="mt-5 border-t border-line pt-4">
      {modo === "combinar" ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Combinar con otra entrada</p>
            <button type="button" onClick={() => setModo("")} className="text-xs text-ink/50 hover:text-ink">
              Cancelar
            </button>
          </div>
          <p className="mb-2 text-xs text-ink/50">
            Elige la entrada destino: conservará su información y {titular} pasará a ser uno de sus huéspedes.
          </p>
          <SelectorEntrada excluirId={reserva.id} fechaRef={reserva.fecha_entrada} onElegir={combinar} />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => setModo("combinar")}
            className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-paper disabled:opacity-50"
          >
            Combinar con otra entrada…
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={eliminar}
            className="rounded-md border border-clay/40 px-3 py-1.5 text-sm text-clay hover:bg-clay/5 disabled:opacity-50"
          >
            Eliminar entrada
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-clay">{error}</p>}
    </div>
  );
}

// Mover un huésped a otra entrada.
export function MoverHuesped({
  huesped,
  fechaRef,
  reservaId,
  onHecho,
}: {
  huesped: { id: string; nombre: string; apellido1: string | null };
  fechaRef: string;
  reservaId: string;
  onHecho: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");

  async function mover(destino: Candidata) {
    const nombre = `${huesped.nombre} ${huesped.apellido1 ?? ""}`.trim();
    if (!window.confirm(`¿Mover a ${nombre} a la entrada de ${destino.nombre} ${destino.apellido1 ?? ""} (${fecha(destino.fecha_entrada)})?`)) return;
    const { error: err } = await supabase.rpc("mover_huespedes", { p_huespedes: [huesped.id], p_destino: destino.id });
    if (err) return setError(err.message);
    window.dispatchEvent(new Event("pendientes-cambiados"));
    onHecho();
  }

  return (
    <div className="mt-5 border-t border-line pt-4">
      {abierto ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Mover a otra entrada</p>
            <button type="button" onClick={() => setAbierto(false)} className="text-xs text-ink/50 hover:text-ink">
              Cancelar
            </button>
          </div>
          <SelectorEntrada excluirId={reservaId} fechaRef={fechaRef} onElegir={mover} />
        </div>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-paper">
          Mover a otra entrada…
        </button>
      )}
      {error && <p className="mt-2 text-sm text-clay">{error}</p>}
    </div>
  );
}
