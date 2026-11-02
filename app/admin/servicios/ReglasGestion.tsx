"use client";

// Reglas de facturación de Gestión por cliente, historizadas por fecha de vigencia.
// Para cambiar una regla a partir de una fecha se crea una regla nueva (las anteriores siguen
// aplicando a sus meses). Los meses ya consolidados no cambian salvo que se recalculen en Ingresos.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Cliente = { id: string; codigo: string | null; nombre: string };
type Tramo = { desde: number; importe: number };
type Regla = {
  id: string;
  cliente_id: string;
  vigente_desde: string;
  tipo: "porcentaje" | "tramos";
  porcentaje: number | null;
  base_calculo: "precio" | "precio_sin_comision";
  ambito: "piso" | "cliente";
  fijo_adicional: number;
  concepto_fijo: string | null;
  notas: string | null;
  reglas_gestion_tramos: Tramo[];
};

const eur = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const fecha = (iso: string) => iso.split("-").reverse().join("/");
const BASES = { precio: "Precio de las reservas", precio_sin_comision: "Precio − comisión del portal" };
const AMBITOS = { cliente: "Todo el cliente", piso: "Cada piso por separado" };

export default function ReglasGestion({ clienteId }: { clienteId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState<Regla | "nueva" | null>(null);
  const [plantilla, setPlantilla] = useState<Regla | null>(null);

  async function cargar() {
    const [c, r] = await Promise.all([
      supabase.from("clientes").select("id, codigo, nombre").order("nombre"),
      supabase
        .from("reglas_gestion")
        .select("*, reglas_gestion_tramos(desde, importe)")
        .eq("cliente_id", clienteId)
        .order("vigente_desde", { ascending: false }),
    ]);
    if (c.error || r.error) setError((c.error ?? r.error)!.message);
    setClientes((c.data as Cliente[]) ?? []);
    setReglas(((r.data as Regla[]) ?? []).map((x) => ({
      ...x,
      reglas_gestion_tramos: [...x.reglas_gestion_tramos].sort((a, b) => a.desde - b.desde),
    })));
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const hoy = new Date().toISOString().slice(0, 10);
  const porCliente = clientes
    .filter((c) => c.id === clienteId)
    .map((c) => ({ c, rs: reglas.filter((r) => r.cliente_id === c.id) }));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink/60">
          Cómo se factura la gestión de este cliente (por porcentaje o por tramos de facturación). Para cambiar las condiciones a partir de una fecha, crea una
          regla nueva con esa fecha de vigencia: los meses anteriores siguen calculándose con la regla antigua y lo ya
          consolidado no se modifica.
        </p>
        <button
          type="button"
          onClick={() => {
            setPlantilla(null);
            setEditando("nueva");
          }}
          className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/90"
        >
          + Nueva regla
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-clay">{error}</p>}

      <div className="mt-5 space-y-6">
        {porCliente.map(({ c, rs }) => {
          const vigente = rs.find((r) => r.vigente_desde <= hoy);
          return (
            <section key={c.id}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Versiones de la regla</h2>
                {vigente && (
                  <button
                    type="button"
                    onClick={() => {
                      setPlantilla(vigente);
                      setEditando("nueva");
                    }}
                    className="text-xs text-ink/60 underline hover:text-ink"
                  >
                    Nueva versión a partir de la vigente
                  </button>
                )}
              </div>
              {rs.length === 0 && (
                <p className="mt-2 text-sm text-ink/50">Este cliente no tiene reglas de gestión: no se genera gestión automática.</p>
              )}
              <ul className="mt-2 space-y-2">
                {rs.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setEditando(r)}
                      className={`w-full rounded-lg border bg-white px-4 py-3 text-left hover:bg-paper ${
                        r === vigente ? "border-ink/40" : "border-line opacity-80"
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">
                          Desde {fecha(r.vigente_desde)}
                          {r === vigente && (
                            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900">Vigente</span>
                          )}
                          {r.vigente_desde > hoy && (
                            <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900">Futura</span>
                          )}
                        </p>
                        <p className="text-sm">
                          {r.tipo === "porcentaje" ? `${r.porcentaje} % de la facturación` : `Tramos (${r.reglas_gestion_tramos.length})`}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-ink/50">
                        {BASES[r.base_calculo]} · {AMBITOS[r.ambito]}
                        {Number(r.fijo_adicional) !== 0 && ` · ${eur(r.fijo_adicional)} para ${r.concepto_fijo ?? "fijo"}`}
                      </p>
                      {r.tipo === "tramos" && (
                        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                          {r.reglas_gestion_tramos.map((t, i) => (
                            <span key={t.desde} className="rounded bg-paper px-1.5 py-0.5 tabular-nums">
                              {i === 0 ? "Base" : `≥ ${Number(t.desde).toLocaleString("es-ES")}`}: {eur(t.importe)}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {editando && (
        <EditarRegla
          regla={editando === "nueva" ? null : editando}
          plantilla={plantilla}
          clienteId={clienteId}
          clientes={clientes}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function primeroMesSiguiente() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 12).toISOString().slice(0, 10);
}

function EditarRegla({
  regla,
  plantilla,
  clienteId,
  clientes,
  onCerrar,
  onGuardado,
}: {
  regla: Regla | null;
  plantilla: Regla | null;
  clienteId: string;
  clientes: Cliente[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const base = regla ?? plantilla;
  const s = (v: unknown) => (v == null ? "" : String(v));
  const [f, setF] = useState({
    cliente_id: clienteId,
    vigente_desde: regla?.vigente_desde ?? primeroMesSiguiente(),
    tipo: base?.tipo ?? "porcentaje",
    porcentaje: s(base?.porcentaje),
    base_calculo: base?.base_calculo ?? "precio_sin_comision",
    ambito: base?.ambito ?? "cliente",
    fijo_adicional: s(base?.fijo_adicional ?? 0),
    concepto_fijo: s(base?.concepto_fijo),
    notas: s(regla?.notas),
  });
  const [tramos, setTramos] = useState<{ desde: string; importe: string }[]>(
    base?.reglas_gestion_tramos.map((t) => ({ desde: s(t.desde), importe: s(t.importe) })) ?? [{ desde: "0", importe: "" }],
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(",", ".")));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const valores = {
      cliente_id: f.cliente_id,
      vigente_desde: f.vigente_desde,
      tipo: f.tipo,
      porcentaje: f.tipo === "porcentaje" ? n(f.porcentaje) : null,
      base_calculo: f.base_calculo,
      ambito: f.ambito,
      fijo_adicional: n(f.fijo_adicional) ?? 0,
      concepto_fijo: f.concepto_fijo.trim() || null,
      notas: f.notas.trim() || null,
    };
    const ts = tramos
      .filter((t) => t.desde.trim() !== "" || t.importe.trim() !== "")
      .map((t) => ({ desde: n(t.desde), importe: n(t.importe) }));
    if (!valores.cliente_id || !valores.vigente_desde) return setError("Indica cliente y fecha de vigencia.");
    if (f.tipo === "porcentaje" && (valores.porcentaje == null || Number.isNaN(valores.porcentaje)))
      return setError("Indica el porcentaje.");
    if (f.tipo === "tramos" && (ts.length === 0 || ts.some((t) => t.desde == null || t.importe == null || Number.isNaN(t.desde) || Number.isNaN(t.importe))))
      return setError("Revisa los tramos: cada uno necesita «desde» e importe numéricos.");
    if (Number.isNaN(valores.fijo_adicional)) return setError("El fijo debe ser un número.");

    setGuardando(true);
    const res = regla
      ? await supabase.from("reglas_gestion").update(valores).eq("id", regla.id).select("id").single()
      : await supabase.from("reglas_gestion").insert(valores).select("id").single();
    if (res.error) {
      setGuardando(false);
      return setError(res.error.message.includes("duplicate") ? "Ya hay una regla de ese cliente con esa fecha." : res.error.message);
    }
    const id = res.data.id as string;
    // Los tramos se guardan completos (se sustituyen los de esta regla).
    const del = await supabase.from("reglas_gestion_tramos").delete().eq("regla_id", id);
    const ins =
      !del.error && f.tipo === "tramos"
        ? await supabase.from("reglas_gestion_tramos").insert(ts.map((t) => ({ ...t, regla_id: id })))
        : { error: del.error };
    setGuardando(false);
    if (ins.error) return setError(ins.error.message);
    onGuardado();
  }

  async function borrar() {
    if (!regla) return;
    if (!window.confirm("¿Borrar esta regla? Los meses ya consolidados no cambian.")) return;
    const { error: err } = await supabase.from("reglas_gestion").delete().eq("id", regla.id);
    if (err) return setError(err.message);
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:px-4">
      <form onSubmit={guardar} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-lg sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{regla ? "Editar regla" : "Nueva regla de gestión"}</h2>
          <button type="button" onClick={onCerrar} className="text-sm text-ink/50 hover:text-ink">
            Cerrar
          </button>
        </div>
        {regla && (
          <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            Corregir una regla cambia el cálculo de los meses abiertos. Si las condiciones cambian a partir de una fecha,
            crea mejor una regla nueva con esa fecha de vigencia.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label>Cliente</label>
            <select value={f.cliente_id} onChange={set("cliente_id")} disabled>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo ? `${c.codigo} · ` : ""}
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Vigente desde</label>
            <input type="date" value={f.vigente_desde} onChange={set("vigente_desde")} />
          </div>
          <div>
            <label>Tipo</label>
            <select value={f.tipo} onChange={set("tipo")}>
              <option value="porcentaje">Porcentaje de la facturación</option>
              <option value="tramos">Tramos de facturación</option>
            </select>
          </div>
          {f.tipo === "porcentaje" ? (
            <div>
              <label>Porcentaje (%)</label>
              <input inputMode="decimal" value={f.porcentaje} onChange={set("porcentaje")} />
            </div>
          ) : (
            <div />
          )}
          <div>
            <label>Facturación del mes</label>
            <select value={f.base_calculo} onChange={set("base_calculo")}>
              {Object.entries(BASES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Se calcula para</label>
            <select value={f.ambito} onChange={set("ambito")}>
              {Object.entries(AMBITOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Fijo que se suma y se descuenta (€)</label>
            <input inputMode="decimal" value={f.fijo_adicional} onChange={set("fijo_adicional")} />
          </div>
          <div>
            <label>Concepto del descuento</label>
            <input value={f.concepto_fijo} onChange={set("concepto_fijo")} placeholder="p. ej. Antonio" />
          </div>
        </div>

        {f.tipo === "tramos" && (
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Tramos</p>
            <p className="mt-0.5 text-xs text-ink/40">
              Cuota total del mes según la facturación alcanzada. El primero es la base (desde 0); cada tramo superior
              añade una línea «Extra» con la diferencia.
            </p>
            <div className="mt-2 space-y-2">
              {tramos.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <div>
                    {i === 0 && <label>Desde (€ facturados)</label>}
                    <input
                      inputMode="decimal"
                      value={t.desde}
                      onChange={(e) => setTramos((p) => p.map((x, j) => (j === i ? { ...x, desde: e.target.value } : x)))}
                    />
                  </div>
                  <div>
                    {i === 0 && <label>Cuota (€)</label>}
                    <input
                      inputMode="decimal"
                      value={t.importe}
                      onChange={(e) => setTramos((p) => p.map((x, j) => (j === i ? { ...x, importe: e.target.value } : x)))}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setTramos((p) => p.filter((_, j) => j !== i))}
                    className="pb-2 text-xs text-clay underline"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTramos((p) => [...p, { desde: "", importe: "" }])}
              className="mt-2 text-xs text-ink/60 underline hover:text-ink"
            >
              + Añadir tramo
            </button>
          </div>
        )}

        <div className="mt-4">
          <label>Notas</label>
          <input value={f.notas} onChange={set("notas")} />
        </div>

        <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 flex items-center justify-end gap-3 border-t border-line bg-white px-5 py-3 sm:-mx-6 sm:-mb-6 sm:px-6">
          {error && <span className="mr-auto text-xs text-clay">{error}</span>}
          {regla && !error && (
            <button type="button" onClick={borrar} className="mr-auto text-xs text-clay underline">
              Borrar regla
            </button>
          )}
          <button type="button" onClick={onCerrar} className="text-sm text-ink/60 hover:text-ink">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
