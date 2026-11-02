"use client";

// Gastos: libro de facturas (pestaña "Facturas" del Sheet de Facturación) e informe trimestral de IVA
// (pestaña "IVA Trimestral Resumen"), calculado solo a partir del libro.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Factura = {
  id: string;
  tipo: "I" | "G";
  fecha: string;
  familia: string | null;
  concepto: string | null;
  comentarios: string | null;
  valor_neto: number | null;
  irpf: number | null;
  iva: number | null;
  suplido: number | null;
  total: number | null;
  tipo_iva: number | null;
  numero_factura: string | null;
  empresa: string | null;
  cif: string | null;
  anio: number;
  mes: number;
  trimestre: number;
  factura_id: string | null;
};

type Trimestre = {
  anio: number;
  trimestre: number;
  facturas_emitidas: number;
  base_ingresos: number;
  iva_repercutido: number;
  irpf_ingresos: number;
  total_ingresos: number;
  facturas_recibidas: number;
  base_gastos: number;
  iva_soportado: number;
  irpf_gastos: number;
  total_gastos: number;
  iva_a_pagar: number;
  resultado: number;
};

const eur = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const num = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (iso: string) => iso.split("-").reverse().join("/");
const suma = (ls: Factura[], k: keyof Factura) => ls.reduce((s, l) => s + (Number(l[k]) || 0), 0);

export default function GastosView() {
  const [pestana, setPestana] = useState<"facturas" | "iva">("facturas");
  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            ["facturas", "Facturas"],
            ["iva", "IVA trimestral"],
          ] as const
        ).map(([k, e]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPestana(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              pestana === k ? "border-ink text-ink" : "border-transparent text-ink/50 hover:text-ink"
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      {pestana === "facturas" ? <LibroFacturas /> : <IvaTrimestral />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function LibroFacturas() {
  const supabase = useMemo(() => createClient(), []);
  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [trimestre, setTrimestre] = useState("");
  const [tipo, setTipo] = useState("");
  const [familia, setFamilia] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filas, setFilas] = useState<Factura[]>([]);
  const [familias, setFamilias] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState<Factura | "nueva" | null>(null);

  async function cargar() {
    setCargando(true);
    let q = supabase.from("libro_facturas").select("*").order("fecha", { ascending: false }).limit(5000);
    if (anio) q = q.eq("anio", Number(anio));
    if (trimestre) q = q.eq("trimestre", Number(trimestre));
    if (tipo) q = q.eq("tipo", tipo);
    if (familia) q = q.eq("familia", familia);
    const { data, error: err } = await q;
    if (err) setError(err.message);
    setFilas((data as Factura[]) ?? []);
    setCargando(false);
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, trimestre, tipo, familia]);
  useEffect(() => {
    supabase
      .from("libro_facturas")
      .select("familia")
      .not("familia", "is", null)
      .limit(5000)
      .then(({ data }) => setFamilias(Array.from(new Set((data ?? []).map((d) => d.familia as string))).sort()));
  }, [supabase]);

  const visibles = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    if (!b) return filas;
    return filas.filter((f) =>
      [f.concepto, f.empresa, f.numero_factura, f.comentarios, f.cif].some((v) => (v ?? "").toLowerCase().includes(b)),
    );
  }, [filas, busqueda]);
  const gastos = visibles.filter((f) => f.tipo === "G");
  const ingresos = visibles.filter((f) => f.tipo === "I");
  const anios = Array.from({ length: hoy.getFullYear() - 2019 + 1 }, (_, i) => String(2020 + i)).reverse();

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="col-span-2 sm:col-span-3 lg:col-span-2">
          <label htmlFor="b">Buscar</label>
          <input id="b" type="search" placeholder="Concepto, empresa, nº…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <div>
          <label htmlFor="a">Año</label>
          <select id="a" value={anio} onChange={(e) => setAnio(e.target.value)}>
            <option value="">Todos</option>
            {anios.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="t">Trimestre</label>
          <select id="t" value={trimestre} onChange={(e) => setTrimestre(e.target.value)}>
            <option value="">Todos</option>
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={t}>
                {t}T
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ti">Tipo</label>
          <select id="ti" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Gastos e ingresos</option>
            <option value="G">Gastos</option>
            <option value="I">Ingresos</option>
          </select>
        </div>
        <div>
          <label htmlFor="f">Familia</label>
          <select id="f" value={familia} onChange={(e) => setFamilia(e.target.value)}>
            <option value="">Todas</option>
            {familias.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Total etiqueta="Gastos (neto)" valor={eur(suma(gastos, "valor_neto"))} sub={`${gastos.length} facturas · IVA ${eur(suma(gastos, "iva"))}`} />
        <Total etiqueta="Ingresos (neto)" valor={eur(suma(ingresos, "valor_neto"))} sub={`${ingresos.length} facturas · IVA ${eur(suma(ingresos, "iva"))}`} />
        <Total etiqueta="IVA a pagar" valor={eur(suma(ingresos, "iva") - suma(gastos, "iva"))} />
        <Total etiqueta="Resultado (neto)" valor={eur(suma(ingresos, "valor_neto") - suma(gastos, "valor_neto"))} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {error ? <p className="text-sm text-clay">{error}</p> : <span />}
        <button
          type="button"
          onClick={() => setEditando("nueva")}
          className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/90"
        >
          + Nueva factura
        </button>
      </div>

      {cargando ? (
        <p className="py-10 text-center text-sm text-ink/40">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink/40">No hay facturas para este filtro.</p>
      ) : (
        <>
          <div className="mt-3 hidden overflow-hidden rounded-lg border border-line bg-white lg:block">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink/50">
                  <th className="w-10 px-3 py-2 font-medium">I/G</th>
                  <th className="w-24 px-2 py-2 font-medium">Fecha</th>
                  <th className="w-36 px-2 py-2 font-medium">Familia</th>
                  <th className="px-2 py-2 font-medium">Concepto / Empresa</th>
                  <th className="w-24 px-2 py-2 font-medium">Nº factura</th>
                  <th className="w-24 px-2 py-2 text-right font-medium">Neto</th>
                  <th className="w-20 px-2 py-2 text-right font-medium">IRPF</th>
                  <th className="w-20 px-2 py-2 text-right font-medium">IVA</th>
                  <th className="w-24 px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.id} onClick={() => setEditando(f)} className="cursor-pointer border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-3 py-2">
                      <Tipo t={f.tipo} />
                    </td>
                    <td className="px-2 py-2 text-xs">{fecha(f.fecha)}</td>
                    <td className="truncate px-2 py-2 text-xs text-ink/70">{f.familia ?? "—"}</td>
                    <td className="truncate px-2 py-2" title={[f.concepto, f.empresa, f.comentarios].filter(Boolean).join(" · ")}>
                      {f.concepto ?? "—"}
                      {f.empresa && <span className="ml-2 text-xs text-ink/40">{f.empresa}</span>}
                    </td>
                    <td className="truncate px-2 py-2 text-xs text-ink/60">{f.numero_factura ?? "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{num(f.valor_neto)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink/60">{f.irpf ? num(f.irpf) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink/60">{f.iva ? num(f.iva) : "—"}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{num(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-2 lg:hidden">
            {visibles.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => setEditando(f)} className="w-full rounded-lg border border-line bg-white px-4 py-3 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        <Tipo t={f.tipo} /> {f.concepto ?? f.familia ?? "—"}
                      </p>
                      <p className="truncate text-xs text-ink/50">
                        {fecha(f.fecha)} · {f.familia ?? "—"}
                        {f.empresa && ` · ${f.empresa}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-medium">{eur(f.total ?? f.valor_neto)}</p>
                      <p className="text-xs text-ink/50">neto {num(f.valor_neto)}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {editando && (
        <EditarFactura
          factura={editando === "nueva" ? null : editando}
          familias={familias}
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

function Tipo({ t }: { t: "I" | "G" }) {
  return t === "I" ? (
    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-900">I</span>
  ) : (
    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-900">G</span>
  );
}

function Total({ etiqueta, valor, sub }: { etiqueta: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2.5">
      <p className="text-xs text-ink/50">{etiqueta}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{valor}</p>
      {sub && <p className="text-xs text-ink/40">{sub}</p>}
    </div>
  );
}

// Alta / edición. IVA = neto × tipo de IVA y total = neto − IRPF + IVA + suplido se recalculan solos
// mientras no se escriban a mano (como en el Sheet, que admite valores manuales).
function EditarFactura({
  factura,
  familias,
  onCerrar,
  onGuardado,
}: {
  factura: Factura | null;
  familias: string[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const s = (v: unknown) => (v == null ? "" : String(v).replace(".", ","));
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(",", ".")));
  const [f, setF] = useState({
    tipo: factura?.tipo ?? "G",
    fecha: factura?.fecha ?? new Date().toISOString().slice(0, 10),
    familia: factura?.familia ?? "",
    concepto: factura?.concepto ?? "",
    comentarios: factura?.comentarios ?? "",
    valor_neto: s(factura?.valor_neto),
    tipo_iva: factura?.tipo_iva != null ? s(Math.round(factura.tipo_iva * 10000) / 100) : factura ? "" : "21",
    irpf: s(factura?.irpf),
    iva: s(factura?.iva),
    suplido: s(factura?.suplido),
    total: s(factura?.total),
    numero_factura: factura?.numero_factura ?? "",
    empresa: factura?.empresa ?? "",
    cif: factura?.cif ?? "",
  });
  const [manual, setManual] = useState({ iva: !!factura, total: !!factura });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Recalcula IVA y total a partir de los demás campos (si no se han tocado a mano).
  function cambiar(k: keyof typeof f, v: string) {
    setF((p) => {
      const nf = { ...p, [k]: v };
      const neto = n(nf.valor_neto) ?? 0;
      const pct = (n(nf.tipo_iva) ?? 0) / 100;
      if (!manual.iva && k !== "iva") nf.iva = neto ? s(Math.round(neto * pct * 100) / 100) : "";
      if (!manual.total && k !== "total") {
        const tot = neto - (n(nf.irpf) ?? 0) + (n(nf.iva) ?? 0) + (n(nf.suplido) ?? 0);
        nf.total = neto || n(nf.suplido) ? s(Math.round(tot * 100) / 100) : "";
      }
      return nf;
    });
    if (k === "iva") setManual((m) => ({ ...m, iva: true }));
    if (k === "total") setManual((m) => ({ ...m, total: true }));
  }
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => cambiar(k, e.target.value) });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const valores = {
      tipo: f.tipo,
      fecha: f.fecha,
      familia: f.familia.trim() || null,
      concepto: f.concepto.trim() || null,
      comentarios: f.comentarios.trim() || null,
      valor_neto: n(f.valor_neto),
      tipo_iva: f.tipo_iva.trim() === "" ? null : (n(f.tipo_iva) ?? 0) / 100,
      irpf: n(f.irpf),
      iva: n(f.iva),
      suplido: n(f.suplido),
      total: n(f.total),
      numero_factura: f.numero_factura.trim() || null,
      empresa: f.empresa.trim() || null,
      cif: f.cif.trim() || null,
    };
    if (!valores.fecha) return setError("Indica la fecha.");
    if (Object.values(valores).some((v) => typeof v === "number" && Number.isNaN(v))) return setError("Revisa los importes.");
    setGuardando(true);
    const { error: err } = factura
      ? await supabase.from("libro_facturas").update(valores).eq("id", factura.id)
      : await supabase.from("libro_facturas").insert(valores);
    setGuardando(false);
    if (err) return setError(err.message);
    onGuardado();
  }

  async function borrar() {
    if (!factura || !window.confirm("¿Borrar esta factura del libro?")) return;
    const { error: err } = await supabase.from("libro_facturas").delete().eq("id", factura.id);
    if (err) return setError(err.message);
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:px-4">
      <form onSubmit={guardar} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-lg sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{factura ? "Editar factura" : "Nueva factura"}</h2>
          <button type="button" onClick={onCerrar} className="text-sm text-ink/50 hover:text-ink">
            Cerrar
          </button>
        </div>
        {factura?.factura_id && (
          <p className="mt-2 rounded-md bg-sky-50 p-2 text-xs text-sky-900">Factura emitida desde Facturación.</p>
        )}
        <datalist id="familias">
          {familias.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label>Tipo</label>
            <select {...campo("tipo")}>
              <option value="G">Gasto</option>
              <option value="I">Ingreso</option>
            </select>
          </div>
          <div>
            <label>Fecha</label>
            <input type="date" {...campo("fecha")} />
          </div>
          <div className="col-span-2">
            <label>Familia</label>
            <input list="familias" {...campo("familia")} />
          </div>
          <div className="col-span-2">
            <label>Concepto</label>
            <input {...campo("concepto")} />
          </div>
          <div className="col-span-2">
            <label>Comentarios</label>
            <input {...campo("comentarios")} />
          </div>
          <div>
            <label>Valor neto</label>
            <input inputMode="decimal" {...campo("valor_neto")} />
          </div>
          <div>
            <label>Tipo IVA (%)</label>
            <input inputMode="decimal" {...campo("tipo_iva")} />
          </div>
          <div>
            <label>IRPF</label>
            <input inputMode="decimal" {...campo("irpf")} />
          </div>
          <div>
            <label>Suplido</label>
            <input inputMode="decimal" {...campo("suplido")} />
          </div>
          <div>
            <label>IVA</label>
            <input inputMode="decimal" {...campo("iva")} />
          </div>
          <div>
            <label>Total factura</label>
            <input inputMode="decimal" {...campo("total")} />
          </div>
          <div className="col-span-2">
            <label>Nº factura</label>
            <input {...campo("numero_factura")} />
          </div>
          <div className="col-span-2">
            <label>Empresa</label>
            <input {...campo("empresa")} />
          </div>
          <div className="col-span-2">
            <label>CIF empresa</label>
            <input {...campo("cif")} />
          </div>
        </div>
        <p className="mt-2 text-xs text-ink/40">IVA = neto × tipo de IVA · Total = neto − IRPF + IVA + suplido (se pueden ajustar a mano).</p>
        <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-3">
          {error && <span className="mr-auto text-xs text-clay">{error}</span>}
          {factura && !error && (
            <button type="button" onClick={borrar} className="mr-auto text-xs text-clay underline">
              Borrar
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

// ---------------------------------------------------------------------------

function IvaTrimestral() {
  const supabase = useMemo(() => createClient(), []);
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [filas, setFilas] = useState<Trimestre[] | null>(null);
  const anios = Array.from({ length: new Date().getFullYear() - 2019 }, (_, i) => String(2020 + i)).reverse();

  useEffect(() => {
    setFilas(null);
    supabase
      .from("v_iva_trimestral")
      .select("*")
      .eq("anio", Number(anio))
      .order("trimestre")
      .then(({ data }) => setFilas((data as Trimestre[]) ?? []));
  }, [supabase, anio]);

  const tot = (k: keyof Trimestre) => (filas ?? []).reduce((s, f) => s + Number(f[k] || 0), 0);
  const columnas: [keyof Trimestre, string, boolean?][] = [
    ["base_ingresos", "Base ingresos"],
    ["iva_repercutido", "IVA repercutido"],
    ["irpf_ingresos", "IRPF retenido"],
    ["base_gastos", "Base gastos"],
    ["iva_soportado", "IVA soportado"],
    ["iva_a_pagar", "IVA a pagar", true],
    ["resultado", "Resultado (neto)"],
  ];

  return (
    <div>
      <div className="max-w-[10rem]">
        <label htmlFor="ai">Año</label>
        <select id="ai" value={anio} onChange={(e) => setAnio(e.target.value)}>
          {anios.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
      {filas === null ? (
        <p className="py-10 text-center text-sm text-ink/40">Calculando…</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-right text-xs text-ink/50">
                  <th className="px-3 py-2 text-left font-medium">Trimestre</th>
                  {columnas.map(([k, e]) => (
                    <th key={k} className="px-3 py-2 font-medium">
                      {e}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4].map((t) => {
                  const f = filas.find((x) => x.trimestre === t);
                  return (
                    <tr key={t} className="border-b border-line text-right tabular-nums">
                      <td className="px-3 py-2 text-left font-medium">
                        {t}T {anio}
                        {f && (
                          <span className="ml-2 text-xs font-normal text-ink/40">
                            {f.facturas_emitidas} emitidas · {f.facturas_recibidas} recibidas
                          </span>
                        )}
                      </td>
                      {columnas.map(([k, , destacado]) => (
                        <td key={k} className={`px-3 py-2 ${destacado ? "font-semibold" : ""}`}>
                          {f ? num(Number(f[k])) : "—"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr className="bg-paper text-right font-semibold tabular-nums">
                  <td className="px-3 py-2 text-left">Total {anio}</td>
                  {columnas.map(([k]) => (
                    <td key={k} className="px-3 py-2">
                      {num(tot(k))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink/40">
            IVA a pagar = IVA de las facturas emitidas − IVA de las facturas recibidas, por fecha de factura. Se recalcula
            solo con cada factura que se añade o modifica en la pestaña Facturas.
          </p>
        </>
      )}
    </div>
  );
}
