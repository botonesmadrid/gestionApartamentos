"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CANALES,
  COLORES_CANAL,
  COLOR_ACTUAL,
  COLOR_ANTERIOR,
  MESES,
  MESES_CORTOS,
  analisisEntradas,
  calcularAnual,
  calcularTrimestre,
  cargarEstancias,
  eur0,
  pct,
  pisosDe,
  signo,
  valorFuturo,
  type Anual,
  type Estancia,
} from "@/lib/reporting";
import { generarInformeTrimestral, type DatosFacturacion } from "@/lib/informeTrimestral";

type Cliente = { id: string; codigo: string | null; nombre: string; pisos_ocupacion: number };
type Pestana = "informe" | "entradas" | "facturacion";

export default function ReportingView({ clientes }: { clientes: Cliente[] }) {
  const supabase = useMemo(() => createClient(), []);
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [clienteId, setClienteId] = useState(clientes.find((c) => c.codigo === "CM")?.id ?? "");
  const [pestana, setPestana] = useState<Pestana>("informe");
  const [estancias, setEstancias] = useState<Estancia[] | null>(null);
  const [error, setError] = useState("");
  const [generando, setGenerando] = useState(0);

  useEffect(() => {
    setEstancias(null);
    setError("");
    cargarEstancias(supabase, [anio - 1, anio, anio + 1], clienteId || null)
      .then(setEstancias)
      .catch((e) => setError(String(e.message ?? e)));
  }, [supabase, anio, clienteId]);

  const cliente = clientes.find((c) => c.id === clienteId);
  const pisos = cliente ? Number(cliente.pisos_ocupacion) || 1 : estancias ? pisosDe(estancias.filter((e) => e.anio === anio), null) : 1;
  const actual = useMemo(() => (estancias ? calcularAnual(estancias, anio, pisos) : null), [estancias, anio, pisos]);
  const anterior = useMemo(() => (estancias ? calcularAnual(estancias, anio - 1, pisos) : null), [estancias, anio, pisos]);
  const anios = Array.from({ length: hoy.getFullYear() - 2020 + 2 }, (_, i) => 2021 + i).reverse();
  const nombreCliente = cliente ? cliente.nombre : "Todos los clientes";

  async function presentacion(t: number) {
    if (!actual || !anterior) return;
    setGenerando(t);
    setError("");
    try {
      const desde = `${anio}-${String((t - 1) * 3 + 1).padStart(2, "0")}-01`;
      const hasta = new Date(anio, t * 3, 0).toLocaleDateString("en-CA");
      const [{ data: iva }, { data: facs }] = await Promise.all([
        supabase.from("v_iva_trimestral").select("*").in("anio", [anio, anio - 1]).eq("trimestre", t),
        (() => {
          let q = supabase.from("facturas").select("destinatario_nombre, base, total, cliente_id").eq("estado", "emitida").gte("fecha", desde).lte("fecha", hasta);
          if (clienteId) q = q.eq("cliente_id", clienteId);
          return q;
        })(),
      ]);
      const porDestinatario = new Map<string, { base: number; total: number }>();
      for (const f of facs ?? []) {
        const k = f.destinatario_nombre ?? "—";
        const v = porDestinatario.get(k) ?? { base: 0, total: 0 };
        porDestinatario.set(k, { base: v.base + Number(f.base), total: v.total + Number(f.total) });
      }
      const facturacion: DatosFacturacion = {
        iva: (iva as DatosFacturacion["iva"]) ?? [],
        facturas: Array.from(porDestinatario.entries()).map(([cliente, v]) => ({ cliente, ...v })),
      };
      await generarInformeTrimestral({ actual, anterior, trimestre: t, nombreCliente, facturacion });
    } catch (e) {
      setError(`No se ha podido generar la presentación: ${String((e as Error).message ?? e)}`);
    }
    setGenerando(0);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-4">
        <div>
          <label htmlFor="cli">Cliente</label>
          <select id="cli" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo ? `${c.codigo} · ` : ""}
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="an">Año</label>
          <select id="an" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {anios.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <p className="pb-2 text-xs text-ink/50">
          Comparado con {anio - 1} · {pisos} {pisos === 1 ? "piso" : "pisos"} para la ocupación
        </p>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-line">
        {(
          [
            ["informe", "Informe anual"],
            ["entradas", "Análisis de entradas"],
            ["facturacion", "Análisis de facturación"],
          ] as const
        ).map(([k, e]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPestana(k)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${
              pestana === k ? "border-ink text-ink" : "border-transparent text-ink/50 hover:text-ink"
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-clay">{error}</p>}
      {!actual || !anterior ? (
        !error && <p className="py-10 text-center text-sm text-ink/40">Calculando…</p>
      ) : pestana === "informe" ? (
        <InformeAnual actual={actual} anterior={anterior} generando={generando} onPresentacion={presentacion} />
      ) : pestana === "entradas" ? (
        <AnalisisEntradas actual={actual} anterior={anterior} estancias={estancias ?? []} />
      ) : (
        <AnalisisFacturacion anio={anio} clienteId={clienteId} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Informe anual (réplica del informe trimestral del gestor) + botones de presentación por trimestre.

function InformeAnual({ actual, anterior, generando, onPresentacion }: { actual: Anual; anterior: Anual; generando: number; onPresentacion: (t: number) => void }) {
  const A = actual.anio;
  const filaMes = (etq: string, f: (i: number) => string, fuerte = false) => (
    <tr className="border-b border-line">
      <th className={`sticky left-0 z-10 bg-white px-3 py-1.5 text-left text-xs ${fuerte ? "font-semibold" : "font-medium text-ink/70"}`}>{etq}</th>
      {actual.meses.map((_, i) => (
        <td key={i} className={`px-2 py-1.5 text-right tabular-nums ${fuerte ? "font-semibold" : ""}`}>
          {f(i)}
        </td>
      ))}
    </tr>
  );
  const filaTrim = (etq: string, f: (t: number) => string) => (
    <tr className="border-b border-line bg-paper/60">
      <th className="sticky left-0 z-10 bg-paper px-3 py-1.5 text-left text-xs font-medium text-ink/70">{etq}</th>
      {[1, 2, 3, 4].map((t) => (
        <td key={t} colSpan={3} className="px-2 py-1.5 text-center tabular-nums">
          {f(t)}
        </td>
      ))}
    </tr>
  );
  const qa = [1, 2, 3, 4].map((t) => calcularTrimestre(actual, t));
  const qp = [1, 2, 3, 4].map((t) => calcularTrimestre(anterior, t));
  const d = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
  const pp = (x: number) => `${(x * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} p.p.`;
  const mesActual = new Date().getFullYear() === A ? new Date().getMonth() + 1 : 13;

  return (
    <div className="mt-4 space-y-6">
      <section className="rounded-lg border border-line bg-white p-4">
        <h2 className="text-sm font-semibold">Presentación trimestral</h2>
        <p className="mt-0.5 text-xs text-ink/50">
          Genera y descarga un PowerPoint con los KPIs del trimestre comparados con el mismo trimestre de {A - 1}, la
          evolución mensual, los canales, las reservas a futuro y la facturación.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((t) => (
            <button
              key={t}
              type="button"
              disabled={!!generando}
              onClick={() => onPresentacion(t)}
              className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${t * 3 <= mesActual - 1 || mesActual === 13 ? "bg-ink text-paper" : "border border-line bg-white text-ink"}`}
              title={t * 3 > mesActual - 1 && mesActual !== 13 ? "Trimestre aún abierto: los datos son provisionales" : undefined}
            >
              {generando === t ? "Generando…" : `Informe ${t}T ${A}`}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">KPIs clave {A}</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-line text-right text-xs text-ink/50">
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium">KPI</th>
                {MESES_CORTOS.map((m) => (
                  <th key={m} className="px-2 py-2 font-medium">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filaMes("Valor reservas a futuro", (i) => eur0(valorFuturo(actual, i + 1)))}
              {filaMes("Ingresos mes", (i) => eur0(actual.meses[i].ingresos), true)}
              {filaMes("Noches disponibles", (i) => String(actual.meses[i].nochesDisponibles))}
              {filaMes("Noches ocupadas", (i) => String(actual.meses[i].nochesOcupadas))}
              {filaMes("Tasa de ocupación", (i) => pct(actual.meses[i].ocupacion), true)}
              {filaMes("Precio medio noche", (i) => eur0(actual.meses[i].precioNoche))}
              {filaMes(`Diferencia ${A - 1} ingresos`, (i) => signo(d(actual.meses[i].ingresos, anterior.meses[i].ingresos), eur0))}
              {filaTrim(`Trimestre ingresos vs ${A - 1}`, (t) => signo(d(qa[t - 1].ingresos, qp[t - 1].ingresos), eur0))}
              {filaMes(`Diferencia ${A - 1} ocupación`, (i) => signo(d(actual.meses[i].ocupacion, anterior.meses[i].ocupacion), pp))}
              {filaTrim(`Trimestre ocupación vs ${A - 1}`, (t) => signo(d(qa[t - 1].ocupacionMedia, qp[t - 1].ocupacionMedia), pp))}
              {filaMes(`Diferencia ${A - 1} precio`, (i) => signo(d(actual.meses[i].precioNoche, anterior.meses[i].precioNoche), eur0))}
              {filaTrim(`Trimestre precio vs ${A - 1}`, (t) => signo(d(qa[t - 1].precioNocheMedio, qp[t - 1].precioNocheMedio), eur0))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Ingresos por canales {A}</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b border-line text-right text-xs text-ink/50">
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium">Canal</th>
                {MESES_CORTOS.map((m) => (
                  <th key={m} className="px-2 py-2 font-medium">
                    {m}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Total {A}</th>
              </tr>
            </thead>
            <tbody>
              {CANALES.filter((c) => actual.meses.some((m) => m.canales[c].reservas)).map((c) => (
                <tr key={c} className="border-b border-line">
                  <th className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left text-xs font-medium">
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COLORES_CANAL[c] }} />
                    {c}
                  </th>
                  {actual.meses.map((m) => (
                    <td key={m.mes} className="px-2 py-1.5 text-right tabular-nums">
                      {m.canales[c].reservas ? (
                        <>
                          {eur0(m.canales[c].ingresos)}
                          <span className="block text-[11px] text-ink/45">{m.canales[c].reservas} res.</span>
                        </>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    {eur0(actual.meses.reduce((s, m) => s + m.canales[c].ingresos, 0))}
                    <span className="block text-[11px] text-ink/45">{actual.meses.reduce((s, m) => s + m.canales[c].reservas, 0)} res.</span>
                  </td>
                </tr>
              ))}
              <tr className="border-b border-line font-semibold">
                <th className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left text-xs">Total</th>
                {actual.meses.map((m) => (
                  <td key={m.mes} className="px-2 py-1.5 text-right tabular-nums">
                    {eur0(m.ingresos)}
                    <span className="block text-[11px] font-normal text-ink/45">{m.reservas} res.</span>
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right tabular-nums">{eur0(actual.meses.reduce((s, m) => s + m.ingresos, 0))}</td>
              </tr>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left text-xs font-medium text-ink/70">Valor medio reserva</th>
                {actual.meses.map((m) => (
                  <td key={m.mes} className="px-2 py-1.5 text-right tabular-nums">
                    {eur0(m.valorMedioReserva)}
                  </td>
                ))}
                <td />
              </tr>
              <tr className="bg-paper/60">
                <th className="sticky left-0 z-10 bg-paper px-3 py-1.5 text-left text-xs font-medium text-ink/70">Precio medio reserva trimestre (vs {A - 1})</th>
                {[1, 2, 3, 4].map((t) => (
                  <td key={t} colSpan={3} className="px-2 py-1.5 text-center tabular-nums">
                    {eur0(qa[t - 1].valorMedioReserva)}{" "}
                    <span className="text-xs text-ink/50">({signo(d(qa[t - 1].valorMedioReserva, qp[t - 1].valorMedioReserva), eur0)})</span>
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gráfico de barras agrupadas (año actual vs anterior), con tooltip al pasar el ratón y tabla accesible.

function BarrasComparadas({
  titulo,
  etiquetas,
  actual,
  anterior,
  anioA,
  formato,
}: {
  titulo: string;
  etiquetas: string[];
  actual: (number | null)[];
  anterior: (number | null)[];
  anioA: number;
  formato: (n: number | null) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...actual.map((x) => x ?? 0), ...anterior.map((x) => x ?? 0));
  const H = 160;
  return (
    <figure className="rounded-lg border border-line bg-white p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="flex gap-3 text-xs text-ink/60">
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COLOR_ACTUAL }} />
            {anioA}
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COLOR_ANTERIOR }} />
            {anioA - 1}
          </span>
        </span>
      </figcaption>
      <div className="relative mt-3">
        <div className="flex items-end gap-1" style={{ height: H }} onMouseLeave={() => setHover(null)}>
          {etiquetas.map((e, i) => (
            <div key={e} className="flex h-full flex-1 cursor-default items-end justify-center gap-[2px]" onMouseEnter={() => setHover(i)}>
              {[actual[i], anterior[i]].map((v, j) => (
                <div
                  key={j}
                  className="w-full max-w-[14px] rounded-t"
                  style={{ height: `${((v ?? 0) / max) * 100}%`, minHeight: v ? 2 : 0, background: j === 0 ? COLOR_ACTUAL : COLOR_ANTERIOR, opacity: hover == null || hover === i ? 1 : 0.45 }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1 border-t border-line pt-1">
          {etiquetas.map((e) => (
            <span key={e} className="flex-1 text-center text-[11px] text-ink/50">
              {e}
            </span>
          ))}
        </div>
        {hover != null && (
          <div className="pointer-events-none absolute top-0 rounded-md border border-line bg-white px-2 py-1 text-xs shadow" style={{ left: `${Math.min(80, (hover / etiquetas.length) * 100)}%` }}>
            <p className="font-medium">{etiquetas[hover]}</p>
            <p>
              {anioA}: {formato(actual[hover])}
            </p>
            <p className="text-ink/60">
              {anioA - 1}: {formato(anterior[hover])}
            </p>
          </div>
        )}
      </div>
    </figure>
  );
}

function AnalisisEntradas({ actual, anterior, estancias }: { actual: Anual; anterior: Anual; estancias: Estancia[] }) {
  const A = actual.anio;
  const ea = analisisEntradas(estancias, A);
  const ep = analisisEntradas(estancias, A - 1);
  const totA = actual.meses.reduce((s, m) => s + m.ingresos, 0);
  const totP = anterior.meses.reduce((s, m) => s + m.ingresos, 0);
  const resA = actual.meses.reduce((s, m) => s + m.reservas, 0);
  const resP = anterior.meses.reduce((s, m) => s + m.reservas, 0);
  const nochesA = actual.meses.reduce((s, m) => s + m.nochesOcupadas, 0);
  const dispA = actual.meses.reduce((s, m) => s + m.nochesDisponibles, 0);
  const nochesP = anterior.meses.reduce((s, m) => s + m.nochesOcupadas, 0);
  const dispP = anterior.meses.reduce((s, m) => s + m.nochesDisponibles, 0);
  const canalesA = CANALES.map((c) => ({ c, v: actual.meses.reduce((s, m) => s + m.canales[c].ingresos, 0) })).filter((x) => x.v);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile etq={`Ingresos ${A}`} valor={eur0(totA)} sub={`${A - 1}: ${eur0(totP)} (${signo(totA - totP, eur0)})`} />
        <Tile etq="Reservas" valor={String(resA)} sub={`${A - 1}: ${resP}`} />
        <Tile etq="Ocupación anual" valor={pct(dispA ? nochesA / dispA : null)} sub={`${A - 1}: ${pct(dispP ? nochesP / dispP : null)}`} />
        <Tile etq="Precio medio noche" valor={eur0(nochesA ? totA / nochesA : null)} sub={`${A - 1}: ${eur0(nochesP ? totP / nochesP : null)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarrasComparadas titulo="Ingresos por mes" etiquetas={MESES_CORTOS} actual={actual.meses.map((m) => m.ingresos)} anterior={anterior.meses.map((m) => m.ingresos)} anioA={A} formato={eur0} />
        <BarrasComparadas
          titulo="Ocupación por mes"
          etiquetas={MESES_CORTOS}
          actual={actual.meses.map((m) => m.ocupacion)}
          anterior={anterior.meses.map((m) => m.ocupacion)}
          anioA={A}
          formato={(n) => pct(n)}
        />
        <BarrasComparadas titulo="Reservas por mes" etiquetas={MESES_CORTOS} actual={actual.meses.map((m) => m.reservas)} anterior={anterior.meses.map((m) => m.reservas)} anioA={A} formato={(n) => (n == null ? "—" : String(n))} />
        <BarrasComparadas
          titulo="Estancia media (noches)"
          etiquetas={MESES_CORTOS}
          actual={ea.map((m) => m.estanciaMedia)}
          anterior={ep.map((m) => m.estanciaMedia)}
          anioA={A}
          formato={(n) => (n == null ? "—" : n.toLocaleString("es-ES", { maximumFractionDigits: 1 }))}
        />
      </div>

      <section className="rounded-lg border border-line bg-white p-4">
        <h2 className="text-sm font-semibold">Peso de cada canal en los ingresos de {A}</h2>
        {canalesA.length === 0 ? (
          <p className="mt-2 text-sm text-ink/40">Sin datos.</p>
        ) : (
          <>
            <div className="mt-3 flex h-4 overflow-hidden rounded">
              {canalesA.map(({ c, v }) => (
                <div key={c} title={`${c}: ${eur0(v)} (${pct(v / totA)})`} style={{ width: `${(v / totA) * 100}%`, background: COLORES_CANAL[c] }} className="border-r-2 border-white last:border-0" />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              {canalesA.map(({ c, v }) => (
                <li key={c} className="flex items-center justify-between gap-2">
                  <span>
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COLORES_CANAL[c] }} />
                    {c}
                  </span>
                  <span className="tabular-nums text-ink/70">{pct(v / totA, 0)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-right text-xs text-ink/50">
              <th className="px-3 py-2 text-left font-medium">Mes {A}</th>
              <th className="px-2 py-2 font-medium">Reservas</th>
              <th className="px-2 py-2 font-medium">Ingresos</th>
              <th className="px-2 py-2 font-medium">Comisiones portales</th>
              <th className="px-2 py-2 font-medium">Estancia media</th>
              <th className="px-3 py-2 font-medium">Antelación media</th>
            </tr>
          </thead>
          <tbody>
            {ea.map((m, i) => (
              <tr key={m.mes} className="border-b border-line text-right tabular-nums last:border-0">
                <td className="px-3 py-1.5 text-left">{MESES[i]}</td>
                <td className="px-2 py-1.5">{m.reservas}</td>
                <td className="px-2 py-1.5">{eur0(actual.meses[i].ingresos)}</td>
                <td className="px-2 py-1.5">{eur0(m.comision)}</td>
                <td className="px-2 py-1.5">{m.estanciaMedia == null ? "—" : `${m.estanciaMedia.toLocaleString("es-ES", { maximumFractionDigits: 1 })} n.`}</td>
                <td className="px-3 py-1.5">{m.antelacion == null ? "—" : `${Math.round(m.antelacion)} días`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Tile({ etq, valor, sub }: { etq: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2.5">
      <p className="text-xs text-ink/50">{etq}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{valor}</p>
      {sub && <p className="text-xs text-ink/40">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Análisis de facturación: facturado (libro de facturas) por mes vs año anterior, por cliente y gastos por familia.

type Libro = { tipo: "I" | "G"; anio: number; mes: number; familia: string | null; empresa: string | null; valor_neto: number | null };

function AnalisisFacturacion({ anio, clienteId }: { anio: number; clienteId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [libro, setLibro] = useState<Libro[] | null>(null);
  const [porCliente, setPorCliente] = useState<{ nombre: string; a: number; p: number }[]>([]);

  useEffect(() => {
    setLibro(null);
    (async () => {
      const filas: Libro[] = [];
      for (let i = 0; ; i += 1000) {
        const { data } = await supabase.from("libro_facturas").select("tipo, anio, mes, familia, empresa, valor_neto").in("anio", [anio, anio - 1]).range(i, i + 999);
        filas.push(...((data as Libro[]) ?? []));
        if (!data || data.length < 1000) break;
      }
      setLibro(filas);
      let q = supabase.from("facturas").select("cliente_id, destinatario_nombre, base, fecha, clientes(nombre)").eq("estado", "emitida").gte("fecha", `${anio - 1}-01-01`).lte("fecha", `${anio}-12-31`);
      if (clienteId) q = q.eq("cliente_id", clienteId);
      const { data: facs } = await q;
      const m = new Map<string, { a: number; p: number }>();
      for (const f of (facs as unknown as { destinatario_nombre: string | null; base: number; fecha: string; clientes: { nombre: string } | null }[]) ?? []) {
        const k = f.clientes?.nombre ?? f.destinatario_nombre ?? "Sin cliente";
        const v = m.get(k) ?? { a: 0, p: 0 };
        if (f.fecha.startsWith(String(anio))) v.a += Number(f.base);
        else v.p += Number(f.base);
        m.set(k, v);
      }
      setPorCliente(Array.from(m.entries()).map(([nombre, v]) => ({ nombre, ...v })).sort((x, y) => y.a - x.a));
    })();
  }, [supabase, anio, clienteId]);

  if (!libro) return <p className="py-10 text-center text-sm text-ink/40">Calculando…</p>;
  const mensual = (tipo: "I" | "G", a: number) => Array.from({ length: 12 }, (_, i) => libro.filter((l) => l.tipo === tipo && l.anio === a && l.mes === i + 1).reduce((s, l) => s + (Number(l.valor_neto) || 0), 0));
  const ingA = mensual("I", anio);
  const ingP = mensual("I", anio - 1);
  const gasA = mensual("G", anio);
  const gasP = mensual("G", anio - 1);
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const familias = Array.from(
    libro
      .filter((l) => l.tipo === "G" && l.anio === anio)
      .reduce((m, l) => m.set(l.familia ?? "Sin familia", (m.get(l.familia ?? "Sin familia") ?? 0) + (Number(l.valor_neto) || 0)), new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]);
  const maxFam = Math.max(1, ...familias.map((f) => f[1]));

  return (
    <div className="mt-4 space-y-4">
      {clienteId && <p className="text-xs text-ink/50">El libro de facturas y los gastos son de toda la empresa; el desglose por cliente sí aplica el filtro.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile etq={`Facturado ${anio} (base)`} valor={eur0(sum(ingA))} sub={`${anio - 1}: ${eur0(sum(ingP))}`} />
        <Tile etq={`Gastos ${anio} (base)`} valor={eur0(sum(gasA))} sub={`${anio - 1}: ${eur0(sum(gasP))}`} />
        <Tile etq="Resultado" valor={eur0(sum(ingA) - sum(gasA))} sub={`${anio - 1}: ${eur0(sum(ingP) - sum(gasP))}`} />
        <Tile etq="Margen" valor={pct(sum(ingA) ? (sum(ingA) - sum(gasA)) / sum(ingA) : null, 0)} sub={`${anio - 1}: ${pct(sum(ingP) ? (sum(ingP) - sum(gasP)) / sum(ingP) : null, 0)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarrasComparadas titulo="Facturado por mes (base)" etiquetas={MESES_CORTOS} actual={ingA} anterior={ingP} anioA={anio} formato={eur0} />
        <BarrasComparadas titulo="Gastos por mes (base)" etiquetas={MESES_CORTOS} actual={gasA} anterior={gasP} anioA={anio} formato={eur0} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-white p-4">
          <h2 className="text-sm font-semibold">Facturas emitidas por cliente (base)</h2>
          {porCliente.length === 0 ? (
            <p className="mt-2 text-sm text-ink/40">Sin facturas emitidas.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-right text-xs text-ink/50">
                  <th className="py-1.5 text-left font-medium">Cliente</th>
                  <th className="py-1.5 font-medium">{anio}</th>
                  <th className="py-1.5 font-medium">{anio - 1}</th>
                  <th className="py-1.5 font-medium">Dif.</th>
                </tr>
              </thead>
              <tbody>
                {porCliente.map((c) => (
                  <tr key={c.nombre} className="border-b border-line text-right tabular-nums last:border-0">
                    <td className="py-1.5 text-left">{c.nombre}</td>
                    <td className="py-1.5">{eur0(c.a)}</td>
                    <td className="py-1.5 text-ink/60">{eur0(c.p)}</td>
                    <td className="py-1.5">{signo(c.a - c.p, eur0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="rounded-lg border border-line bg-white p-4">
          <h2 className="text-sm font-semibold">Gastos {anio} por familia</h2>
          <ul className="mt-3 space-y-2">
            {familias.map(([f, v]) => (
              <li key={f} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span>{f}</span>
                  <span className="tabular-nums text-ink/70">{eur0(v)}</span>
                </div>
                <div className="mt-0.5 h-2 rounded bg-paper">
                  <div className="h-2 rounded" style={{ width: `${(v / maxFam) * 100}%`, background: COLOR_ACTUAL }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
