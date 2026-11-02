"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ReglasGestion from "./ReglasGestion";

type Cliente = { id: string; codigo: string | null; nombre: string };
type Pestana = "general" | "checkin" | "limpieza" | "gestion";
const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "general", etiqueta: "General" },
  { clave: "checkin", etiqueta: "Check-in" },
  { clave: "limpieza", etiqueta: "Limpieza" },
  { clave: "gestion", etiqueta: "Gestión" },
];

const eur = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const fecha = (iso: string) => iso.split("-").reverse().join("/");
const s = (v: unknown) => (v == null ? "" : String(v).replace(".", ","));
const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(",", ".")));

export default function ServiciosCliente({ clientes, clienteInicial }: { clientes: Cliente[]; clienteInicial?: string }) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState(
    clientes.some((c) => c.id === clienteInicial) ? clienteInicial! : (clientes[0]?.id ?? ""),
  );
  const [pestana, setPestana] = useState<Pestana>("general");

  return (
    <div>
      <div className="max-w-sm">
        <label htmlFor="cliente">Cliente</label>
        <select
          id="cliente"
          value={clienteId}
          onChange={(e) => {
            setClienteId(e.target.value);
            router.replace(`/admin/servicios?cliente=${e.target.value}`);
          }}
        >
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo ? `${c.codigo} · ` : ""}
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            onClick={() => setPestana(p.clave)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${
              pestana === p.clave ? "border-ink text-ink" : "border-transparent text-ink/50 hover:text-ink"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {clienteId && pestana === "general" && <General key={clienteId} clienteId={clienteId} />}
        {clienteId && pestana === "checkin" && <Servicio key={clienteId + "c"} clienteId={clienteId} servicio="Checkin" />}
        {clienteId && pestana === "limpieza" && <Servicio key={clienteId + "l"} clienteId={clienteId} servicio="Limpieza" />}
        {clienteId && pestana === "gestion" && (
          <ReglasGestion key={clienteId} clienteId={clienteId} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variables simples guardadas en la ficha del cliente.

type Campo = { key: string; etiqueta: string; tipo: "numero" | "texto" | "sino"; ayuda?: string };

function VariablesCliente({ clienteId, campos, titulo }: { clienteId: string; campos: Campo[]; titulo?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [valores, setValores] = useState<Record<string, string> | null>(null);
  const [estado, setEstado] = useState("");

  useEffect(() => {
    supabase
      .from("clientes")
      .select(campos.map((c) => c.key).join(", "))
      .eq("id", clienteId)
      .single()
      .then(({ data, error }) => {
        if (error) return setEstado(error.message);
        const fila = (data ?? {}) as unknown as Record<string, unknown>;
        setValores(Object.fromEntries(campos.map((c) => [c.key, c.tipo === "sino" ? String(!!fila[c.key]) : c.tipo === "texto" ? String(fila[c.key] ?? "") : s(fila[c.key])])));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!valores) return;
    const cambios: Record<string, unknown> = {};
    for (const c of campos) {
      const v = valores[c.key];
      cambios[c.key] = c.tipo === "sino" ? v === "true" : c.tipo === "numero" ? n(v) : v.trim() || null;
      if (c.tipo === "numero" && Number.isNaN(cambios[c.key])) return setEstado(`«${c.etiqueta}» debe ser un número.`);
    }
    setEstado("Guardando…");
    const { error } = await supabase.from("clientes").update(cambios).eq("id", clienteId);
    setEstado(error ? error.message : "Guardado");
  }

  if (!valores) return <p className="text-sm text-ink/40">{estado || "Cargando…"}</p>;

  return (
    <form onSubmit={guardar} className="rounded-lg border border-line bg-white p-4">
      {titulo && <h2 className="mb-3 text-sm font-semibold">{titulo}</h2>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {campos.map((c) => (
          <div key={c.key}>
            <label>{c.etiqueta}</label>
            {c.tipo === "sino" ? (
              <select value={valores[c.key]} onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })}>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                inputMode={c.tipo === "numero" ? "decimal" : undefined}
                value={valores[c.key]}
                onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })}
              />
            )}
            {c.ayuda && <p className="mt-0.5 text-xs text-ink/40">{c.ayuda}</p>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-3">
        {estado && <span className={`text-xs ${estado === "Guardado" ? "text-emerald-700" : "text-ink/60"}`}>{estado}</span>}
        <button type="submit" className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-paper">
          Guardar
        </button>
      </div>
    </form>
  );
}

function General({ clienteId }: { clienteId: string }) {
  return (
    <VariablesCliente
      clienteId={clienteId}
      titulo="Datos generales de Ingresos"
      campos={[
        { key: "prefijo_ingresos", etiqueta: "Prefijo del nº de línea", tipo: "texto", ayuda: "Si se deja vacío, se usa el código del cliente (p. ej. CM-00438)." },
        { key: "iva_pct", etiqueta: "% IVA incluido en el precio de las reservas", tipo: "numero", ayuda: "Para calcular el precio sin IVA de las líneas nuevas." },
        { key: "pisos_ocupacion", etiqueta: "Nº de pisos (para el % de ocupación)", tipo: "numero" },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Check-in / Limpieza: si cada entrada genera la línea y tarifas con fecha de vigencia.

type Tarifa = {
  id: string;
  vigente_desde: string;
  facturado_bruto: number | null;
  pct_comision: number | null;
  mo_bruto: number | null;
  mo_neto: number | null;
  notas: string | null;
};

function Servicio({ clienteId, servicio }: { clienteId: string; servicio: "Checkin" | "Limpieza" }) {
  const supabase = useMemo(() => createClient(), []);
  const [tarifas, setTarifas] = useState<Tarifa[] | null>(null);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState<Tarifa | "nueva" | null>(null);
  const nombre = servicio === "Checkin" ? "Check-in" : "Limpieza";

  async function cargar() {
    const { data, error: err } = await supabase
      .from("tarifas_servicio")
      .select("id, vigente_desde, facturado_bruto, pct_comision, mo_bruto, mo_neto, notas")
      .eq("cliente_id", clienteId)
      .eq("servicio", servicio)
      .order("vigente_desde", { ascending: false });
    if (err) setError(err.message);
    setTarifas((data as Tarifa[]) ?? []);
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, servicio]);

  const hoy = new Date().toISOString().slice(0, 10);
  const vigente = tarifas?.find((t) => t.vigente_desde <= hoy);

  return (
    <div className="space-y-6">
      <VariablesCliente
        clienteId={clienteId}
        campos={[
          {
            key: servicio === "Checkin" ? "genera_checkin" : "genera_limpieza",
            etiqueta: `Cada entrada genera una línea de ${nombre} al completar el check-in`,
            tipo: "sino",
          },
        ]}
      />

      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Tarifas de {nombre}</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-ink/50">
              Cada línea nueva copia la tarifa vigente en su fecha de entrada. Para cambiar precios a partir de una fecha,
              crea una versión nueva; las líneas ya creadas no cambian.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditando("nueva")}
            className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/90"
          >
            + Nueva versión
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-clay">{error}</p>}
        {tarifas === null ? (
          <p className="mt-3 text-sm text-ink/40">Cargando…</p>
        ) : tarifas.length === 0 ? (
          <p className="mt-3 text-sm text-ink/50">Sin tarifas: las líneas nuevas se crean sin importe.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tarifas.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setEditando(t)}
                  className={`w-full rounded-lg border bg-white px-4 py-3 text-left hover:bg-paper ${
                    t === vigente ? "border-ink/40" : "border-line opacity-80"
                  }`}
                >
                  <p className="text-sm font-medium">
                    Desde {fecha(t.vigente_desde)}
                    {t === vigente && (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900">Vigente</span>
                    )}
                    {t.vigente_desde > hoy && (
                      <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900">Futura</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-ink/60">
                    Facturado {eur(t.facturado_bruto)}
                    {servicio === "Limpieza" && ` · % para Botones ${t.pct_comision ?? "—"}`} · Hora MO {eur(t.mo_bruto)} bruto /{" "}
                    {eur(t.mo_neto)} neto
                  </p>
                  {t.notas && <p className="mt-0.5 text-xs text-ink/40">{t.notas}</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editando && (
        <EditarTarifa
          tarifa={editando === "nueva" ? null : editando}
          plantilla={vigente ?? null}
          clienteId={clienteId}
          servicio={servicio}
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

function EditarTarifa({
  tarifa,
  plantilla,
  clienteId,
  servicio,
  onCerrar,
  onGuardado,
}: {
  tarifa: Tarifa | null;
  plantilla: Tarifa | null;
  clienteId: string;
  servicio: "Checkin" | "Limpieza";
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const base = tarifa ?? plantilla;
  const [f, setF] = useState({
    vigente_desde: tarifa?.vigente_desde ?? primeroMesSiguiente(),
    facturado_bruto: s(base?.facturado_bruto),
    pct_comision: s(base?.pct_comision),
    mo_bruto: s(base?.mo_bruto),
    mo_neto: s(base?.mo_neto),
    notas: tarifa?.notas ?? "",
  });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const valores = {
      cliente_id: clienteId,
      servicio,
      vigente_desde: f.vigente_desde,
      facturado_bruto: n(f.facturado_bruto),
      pct_comision: n(f.pct_comision),
      mo_bruto: n(f.mo_bruto),
      mo_neto: n(f.mo_neto),
      notas: f.notas.trim() || null,
    };
    if (!valores.vigente_desde) return setError("Indica la fecha de vigencia.");
    if ([valores.facturado_bruto, valores.pct_comision, valores.mo_bruto, valores.mo_neto].some((x) => Number.isNaN(x)))
      return setError("Revisa los importes: deben ser números.");
    setGuardando(true);
    const { error: err } = tarifa
      ? await supabase.from("tarifas_servicio").update(valores).eq("id", tarifa.id)
      : await supabase.from("tarifas_servicio").insert(valores);
    setGuardando(false);
    if (err) return setError(err.message.includes("duplicate") ? "Ya hay una versión con esa fecha." : err.message);
    onGuardado();
  }

  async function borrar() {
    if (!tarifa || !window.confirm("¿Borrar esta versión de la tarifa? Las líneas ya creadas no cambian.")) return;
    const { error: err } = await supabase.from("tarifas_servicio").delete().eq("id", tarifa.id);
    if (err) return setError(err.message);
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:px-4">
      <form onSubmit={guardar} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-lg sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">
            {tarifa ? "Editar tarifa" : "Nueva versión de tarifa"} · {servicio === "Checkin" ? "Check-in" : "Limpieza"}
          </h2>
          <button type="button" onClick={onCerrar} className="text-sm text-ink/50 hover:text-ink">
            Cerrar
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label>Vigente desde</label>
            <input type="date" value={f.vigente_desde} onChange={set("vigente_desde")} />
          </div>
          <div>
            <label>Facturado por servicio (€)</label>
            <input inputMode="decimal" value={f.facturado_bruto} onChange={set("facturado_bruto")} />
          </div>
          {servicio === "Limpieza" ? (
            <div>
              <label>% del facturado para Botones</label>
              <input inputMode="decimal" value={f.pct_comision} onChange={set("pct_comision")} />
            </div>
          ) : (
            <div />
          )}
          <div className="hidden sm:block" />
          <div>
            <label>Hora MO bruto (€)</label>
            <input inputMode="decimal" value={f.mo_bruto} onChange={set("mo_bruto")} />
          </div>
          <div>
            <label>Hora MO neto (€)</label>
            <input inputMode="decimal" value={f.mo_neto} onChange={set("mo_neto")} />
          </div>
          <div className="sm:col-span-2">
            <label>Notas</label>
            <input value={f.notas} onChange={set("notas")} />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-3">
          {error && <span className="mr-auto text-xs text-clay">{error}</span>}
          {tarifa && !error && (
            <button type="button" onClick={borrar} className="mr-auto text-xs text-clay underline">
              Borrar versión
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
