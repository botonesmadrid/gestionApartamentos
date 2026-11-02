"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Cliente = { id: string; codigo: string | null; nombre: string };
type Factura = {
  id: string;
  numero: string;
  cliente_id: string | null;
  fecha: string;
  periodo_desde: string | null;
  destinatario_nombre: string | null;
  base: number;
  iva: number;
  irpf: number;
  total: number;
  estado: "borrador" | "emitida" | "anulada";
  origen: "app" | "historico";
  tipo: "ordinaria" | "rectificativa";
  enviada_at: string | null;
  series_facturacion: { nombre: string; codigo: string } | null;
};

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const eur = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const fecha = (iso: string) => iso.split("-").reverse().join("/");

export function EstadoFactura({ f }: { f: { estado: string; origen: string; enviada_at: string | null; tipo?: string } }) {
  const rect = f.tipo === "rectificativa" && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-900">Rectificativa</span>;
  if (f.estado === "borrador")
    return (
      <span className="inline-flex gap-1">
        {rect}
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">Sin enviar</span>
      </span>
    );
  if (f.estado === "anulada") return <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-900">Anulada</span>;
  return (
    <span className="inline-flex gap-1">
      {rect}
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900">{f.origen === "historico" ? "Histórico" : f.enviada_at ? "Enviada" : "Emitida"}</span>
    </span>
  );
}

export default function FacturacionView({ clientes }: { clientes: Cliente[] }) {
  const supabase = useMemo(() => createClient(), []);
  const hoy = new Date();
  const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [estado, setEstado] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [genDesde, setGenDesde] = useState(iso(mesAnterior));
  const [genHasta, setGenHasta] = useState(iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)));
  const [genCliente, setGenCliente] = useState(clientes[0]?.id ?? "");
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState("");

  async function cargar() {
    setCargando(true);
    let q = supabase
      .from("facturas")
      .select("id, numero, cliente_id, fecha, periodo_desde, destinatario_nombre, base, iva, irpf, total, estado, origen, tipo, enviada_at, series_facturacion(nombre, codigo)")
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false })
      .limit(2000);
    if (anio) q = q.gte("fecha", `${anio}-01-01`).lte("fecha", `${anio}-12-31`);
    if (anio && mes) {
      const fin = new Date(Number(anio), Number(mes), 0).getDate();
      q = q.gte("fecha", `${anio}-${mes.padStart(2, "0")}-01`).lte("fecha", `${anio}-${mes.padStart(2, "0")}-${fin}`);
    }
    if (clienteId) q = q.eq("cliente_id", clienteId);
    if (estado) q = q.eq("estado", estado);
    const { data, error: err } = await q;
    if (err) setError(err.message);
    setFacturas((data as unknown as Factura[]) ?? []);
    setCargando(false);
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes, clienteId, estado]);

  async function generar() {
    setGenerando(true);
    setAviso("");
    setError("");
    if (!genCliente) {
      setGenerando(false);
      return setError("Elige el cliente.");
    }
    const { data, error: err } = await supabase.rpc("generar_facturas_periodo", {
      p_cliente: genCliente,
      p_desde: genDesde,
      p_hasta: genHasta,
    });
    setGenerando(false);
    if (err) return setError(err.message);
    setAviso(
      data
        ? `${data} ${data === 1 ? "factura generada" : "facturas generadas"} en borrador. Revísalas y envíalas; mientras no se envíen puedes volver a generarlas.`
        : "No se ha generado ninguna: el cliente no tiene series de facturación activas o sus facturas de ese periodo ya están enviadas.",
    );
    setAnio(genHasta.slice(0, 4));
    setMes(String(Number(genHasta.slice(5, 7))));
    setClienteId(genCliente);
    cargar();
  }

  const visibles = useMemo(() => {
    // Las facturas de clientes desactivados no se muestran.
    const activas = facturas.filter((f) => !f.cliente_id || clientes.some((c) => c.id === f.cliente_id));
    const b = busqueda.trim().toLowerCase();
    if (!b) return activas;
    return activas.filter((f) => [f.numero, f.destinatario_nombre, f.series_facturacion?.nombre].some((v) => (v ?? "").toLowerCase().includes(b)));
  }, [facturas, busqueda, clientes]);
  const emitidas = visibles.filter((f) => f.estado === "emitida");
  const anios = Array.from({ length: hoy.getFullYear() - 2019 + 1 }, (_, i) => String(2020 + i)).reverse();
  const nombreCliente = (id: string | null) => clientes.find((c) => c.id === id)?.codigo ?? "";

  return (
    <div>
      {/* Generar facturas de un periodo */}
      <section className="rounded-lg border border-line bg-white p-4">
        <h2 className="text-sm font-semibold">Generar facturas</h2>
        <p className="mt-0.5 text-xs text-ink/50">
          Crea las facturas del cliente para el periodo (una por cada serie de facturación) con las líneas de Ingresos. Si
          ya existen y no se han enviado, se vuelven a generar con los datos actuales; las enviadas no se tocan.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="gc">Cliente</label>
            <select id="gc" value={genCliente} onChange={(e) => setGenCliente(e.target.value)}>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo ? `${c.codigo} · ` : ""}
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="gd">Desde</label>
            <input id="gd" type="date" value={genDesde} onChange={(e) => setGenDesde(e.target.value)} />
          </div>
          <div>
            <label htmlFor="gh">Hasta</label>
            <input id="gh" type="date" value={genHasta} onChange={(e) => setGenHasta(e.target.value)} />
          </div>
          <div className="flex gap-2 pb-0.5 text-xs">
            {[1, 0].map((atras) => {
              const d = new Date(hoy.getFullYear(), hoy.getMonth() - atras, 1);
              return (
                <button
                  key={atras}
                  type="button"
                  onClick={() => {
                    setGenDesde(iso(d));
                    setGenHasta(iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
                  }}
                  className="rounded border border-line px-2 py-1 text-ink/70 hover:bg-paper"
                >
                  {MESES[d.getMonth()]}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={generar}
            disabled={generando || !genDesde || !genHasta}
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
          >
            {generando ? "Generando…" : "Generar facturas"}
          </button>
        </div>
        {aviso && <p className="mt-2 text-sm text-emerald-700">{aviso}</p>}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="col-span-2 sm:col-span-3 lg:col-span-1">
          <label htmlFor="b">Buscar</label>
          <input id="b" type="search" placeholder="Nº, destinatario…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
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
          <label htmlFor="m">Mes</label>
          <select id="m" value={mes} onChange={(e) => setMes(e.target.value)} disabled={!anio}>
            <option value="">Todos</option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="c">Cliente</label>
          <select id="c" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
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
          <label htmlFor="e">Estado</label>
          <select id="e" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="borrador">Sin enviar</option>
            <option value="emitida">Enviada / emitida</option>
            <option value="anulada">Anulada</option>
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Total etiqueta="Facturas" valor={String(visibles.length)} sub={`${visibles.filter((f) => f.estado === "borrador").length} sin enviar`} />
        <Total etiqueta="Base emitida" valor={eur(emitidas.reduce((s, f) => s + Number(f.base), 0))} />
        <Total etiqueta="IVA" valor={eur(emitidas.reduce((s, f) => s + Number(f.iva), 0))} />
        <Total etiqueta="Total facturado" valor={eur(emitidas.reduce((s, f) => s + Number(f.total), 0))} />
      </div>
      {error && <p className="mt-3 text-sm text-clay">{error}</p>}

      {cargando ? (
        <p className="py-10 text-center text-sm text-ink/40">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink/40">No hay facturas para este filtro.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
          {visibles.map((f) => (
            <li key={f.id}>
              <Link href={`/facturacion/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {f.numero}
                    <span className="ml-2 font-normal text-ink/60">{f.series_facturacion?.nombre ?? f.destinatario_nombre}</span>
                  </p>
                  <p className="truncate text-xs text-ink/50">
                    {fecha(f.fecha)} · {nombreCliente(f.cliente_id) && `${nombreCliente(f.cliente_id)} · `}
                    {f.destinatario_nombre}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <EstadoFactura f={f} />
                  <span className="w-24 text-right font-medium tabular-nums">{eur(f.total)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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
