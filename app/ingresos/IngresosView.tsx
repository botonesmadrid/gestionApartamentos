"use client";

// Módulo Ingresos: réplica de la pestaña "Ingresos" del Sheet de facturación.
// Lee la vista v_ingresos (las columnas calculadas las hace la base de datos con las fórmulas del Sheet).

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Cliente = { id: string; codigo: string | null; nombre: string };
type Origen = { codigo: string; nombre: string };

type Linea = {
  id: string;
  numero: string | null;
  servicio: string;
  reserva_id: string | null;
  origen_datos: string;
  cliente_id: string;
  cliente: string | null;
  motivo: string | null;
  documento: string | null;
  codigo_reserva: string | null;
  origen_codigo: string | null;
  comision_portal: number | null;
  precio: number | null;
  fecha_reserva: string | null;
  entrada: string | null;
  salida: string | null;
  fecha_pago: string | null;
  forma_pago: string | null;
  piso: string | null;
  horas_mo: number | null;
  mo: string | null;
  mo_si_no: string | null;
  horario: string | null;
  iva_pct: number | null;
  fila_sheet?: number | null;
  precio_sin_comision: number | null;
  facturado_bruto: number | null;
  pct_comision_limpieza: number | null;
  precio_sin_iva: number | null;
  facturado_neto: number | null;
  mo_unitario_bruto: number | null;
  mo_unitario_neto: number | null;
  coste_mo_bruto: number | null;
  coste_mo_neto: number | null;
  noches: number | null;
  pct_ocupacion: number | null;
  facturado_neto_manual: number | null;
  coste_mo_bruto_manual: number | null;
  coste_mo_neto_manual: number | null;
};

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
// Pestañas del módulo: cada una agrupa uno o varios servicios.
type Pestana = "checkin" | "limpieza" | "gestion";
const PESTANAS: { clave: Pestana; etiqueta: string; servicios: string[] }[] = [
  { clave: "checkin", etiqueta: "Check-in", servicios: ["Checkin"] },
  { clave: "limpieza", etiqueta: "Limpieza", servicios: ["Limpieza"] },
  {
    clave: "gestion",
    etiqueta: "Gestión",
    servicios: ["Gestión", "Servicios"],
  },
];

const eur = (n: number | null | undefined) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const num = (n: number | null | undefined, d = 2) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("es-ES", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
const fecha = (iso: string | null) =>
  iso ? iso.split("-").reverse().join("/") : "—";
const suma = (ls: Linea[], k: keyof Linea) =>
  ls.reduce((s, l) => s + (Number(l[k]) || 0), 0);

export default function IngresosView({
  clientes,
  origenes,
}: {
  clientes: Cliente[];
  origenes: Origen[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [pestana, setPestana] = useState<Pestana>("checkin");
  const esCheckin = pestana === "checkin";
  const [busqueda, setBusqueda] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState<Linea | "nueva" | null>(null);

  async function cargar() {
    setCargando(true);
    setError("");
    let q = supabase
      .from("v_ingresos")
      .select("*")
      .order("entrada", { ascending: false })
      .limit(5000);
    if (anio) q = q.eq("anio_e", Number(anio));
    if (mes) q = q.eq("mes_e", Number(mes));
    if (clienteId) q = q.eq("cliente_id", clienteId);
    q = q.eq("pestana", pestana);
    const { data, error: err } = await q;
    if (err) setError(err.message);
    setLineas((data as Linea[]) ?? []);
    setCargando(false);
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes, clienteId, pestana]);

  const visibles = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    if (!b) return lineas;
    return lineas.filter((l) =>
      [l.motivo, l.codigo_reserva, l.numero, l.piso, l.documento].some((v) =>
        (v ?? "").toLowerCase().includes(b),
      ),
    );
  }, [lineas, busqueda]);

  const anios = Array.from({ length: hoy.getFullYear() - 2019 + 2 }, (_, i) =>
    String(2020 + i),
  ).reverse();

  return (
    <div>
      {/* Pestañas */}
      <div className="mb-4 flex gap-1 border-b border-line">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            onClick={() => setPestana(p.clave)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              pestana === p.clave
                ? "border-ink text-ink"
                : "border-transparent text-ink/50 hover:text-ink"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="col-span-2 sm:col-span-3 lg:col-span-2">
          <label htmlFor="buscar">Buscar</label>
          <input
            id="buscar"
            type="search"
            placeholder="Titular, código, nº, piso…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="anio">Año de entrada</label>
          <select
            id="anio"
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
          >
            <option value="">Todos</option>
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mes">Mes</label>
          <select id="mes" value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="">Todos</option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cliente">Cliente</label>
          <select
            id="cliente"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
          >
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo ? `${c.codigo} · ` : ""}
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Totales del periodo */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Total etiqueta="Líneas" valor={String(visibles.length)} />
        {esCheckin ? (
          <>
            <Total
              etiqueta="Precio reservas"
              valor={eur(suma(visibles, "precio"))}
            />
            <Total
              etiqueta="Comisión portales"
              valor={eur(suma(visibles, "comision_portal"))}
            />
            <Total
              etiqueta="Sin IVA"
              valor={eur(suma(visibles, "precio_sin_iva"))}
            />
          </>
        ) : (
          <>
            <Total
              etiqueta="Facturado Botones (bruto)"
              valor={eur(suma(visibles, "facturado_bruto"))}
            />
            <Total
              etiqueta="Coste MO (bruto)"
              valor={eur(suma(visibles, "coste_mo_bruto"))}
            />
            <Total
              etiqueta="Coste MO (neto)"
              valor={eur(suma(visibles, "coste_mo_neto"))}
            />
          </>
        )}
        <Total
          etiqueta="Facturado Botones (neto)"
          valor={eur(suma(visibles, "facturado_neto"))}
          sub={
            esCheckin
              ? `bruto ${eur(suma(visibles, "facturado_bruto"))}`
              : undefined
          }
        />
        {esCheckin ? (
          <Total
            etiqueta={mes ? "Ocupación del mes" : "Noches"}
            valor={
              mes
                ? `${num(suma(visibles, "pct_ocupacion"), 1)} %`
                : String(suma(visibles, "noches"))
            }
            sub={
              suma(visibles, "coste_mo_bruto")
                ? `MO ${eur(suma(visibles, "coste_mo_bruto"))}`
                : undefined
            }
          />
        ) : (
          <Total
            etiqueta="Horas MO"
            valor={num(suma(visibles, "horas_mo"), 1)}
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {error ? <p className="text-sm text-clay">{error}</p> : <span />}
        <button
          type="button"
          onClick={() => setEditando("nueva")}
          className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/90"
        >
          + Nueva línea
        </button>
      </div>

      {pestana === "gestion" && <GestionProvisional />}

      {/* Listado */}
      {cargando ? (
        <p className="py-10 text-center text-sm text-ink/40">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink/40">
          No hay líneas para este filtro.
        </p>
      ) : pestana === "gestion" ? (
        <GestionAgrupada lineas={visibles} onEditar={setEditando} onRecalculado={cargar} />
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="mt-3 hidden overflow-hidden rounded-lg border border-line bg-white lg:block">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink/50">
                  <th className="w-24 px-3 py-2 font-medium">Nº</th>
                  <th className="w-12 px-2 py-2 font-medium">Cli.</th>
                  <th className="px-3 py-2 font-medium">Motivo</th>
                  <th className="w-16 px-2 py-2 font-medium">Piso</th>
                  <th className="w-40 px-2 py-2 font-medium">
                    Entrada → Salida
                  </th>
                  {esCheckin ? (
                    <>
                      <th className="w-12 px-2 py-2 text-right font-medium">
                        Noch.
                      </th>
                      <th className="w-24 px-2 py-2 text-right font-medium">
                        Precio
                      </th>
                      <th className="w-20 px-2 py-2 text-right font-medium">
                        Comisión
                      </th>
                      <th className="w-24 px-2 py-2 text-right font-medium">
                        Sin IVA
                      </th>
                      <th className="w-20 px-2 py-2 text-right font-medium">
                        Botones
                      </th>
                      <th className="w-16 px-3 py-2 text-right font-medium">
                        Ocup.
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="w-24 px-2 py-2 text-right font-medium">
                        Bruto
                      </th>
                      <th className="w-14 px-2 py-2 text-right font-medium">
                        %
                      </th>
                      <th className="w-24 px-2 py-2 text-right font-medium">
                        Neto
                      </th>
                      <th className="w-14 px-2 py-2 text-right font-medium">
                        Horas
                      </th>
                      <th className="w-24 px-3 py-2 text-right font-medium">
                        Coste MO
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {visibles.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => setEditando(l)}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-paper"
                  >
                    <td className="truncate px-3 py-2 text-xs text-ink/60">
                      {l.numero ?? "—"}
                      {l.servicio === "Servicios" && (
                        <span className="ml-1 rounded bg-sky-100 px-1 text-sky-900">
                          {l.servicio}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs font-semibold">
                      {l.cliente}
                    </td>
                    <td className="truncate px-3 py-2" title={l.motivo ?? ""}>
                      {l.motivo ?? "—"}
                      {l.codigo_reserva && (
                        <span className="ml-2 text-xs text-ink/40">
                          {l.codigo_reserva}
                        </span>
                      )}
                    </td>
                    <td className="truncate px-2 py-2">{l.piso ?? "—"}</td>
                    <td className="px-2 py-2 text-xs">
                      {fecha(l.entrada)} → {fecha(l.salida)}
                    </td>
                    {esCheckin ? (
                      <>
                        <td className="px-2 py-2 text-right">
                          {l.noches ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {num(l.precio)}
                        </td>
                        <td className="px-2 py-2 text-right text-ink/60">
                          {num(l.comision_portal)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {num(l.precio_sin_iva)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {num(l.facturado_neto)}
                        </td>
                        <td className="px-3 py-2 text-right text-ink/60">
                          {l.pct_ocupacion != null
                            ? num(l.pct_ocupacion, 1)
                            : "—"}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-2 text-right">
                          {num(l.facturado_bruto)}
                        </td>
                        <td className="px-2 py-2 text-right text-ink/60">
                          {l.pct_comision_limpieza != null
                            ? num(l.pct_comision_limpieza, 0)
                            : "—"}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {num(l.facturado_neto)}
                        </td>
                        <td className="px-2 py-2 text-right text-ink/60">
                          {l.horas_mo != null ? num(l.horas_mo, 1) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {num(l.coste_mo_bruto)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil y tablet: tarjetas */}
          <ul className="mt-3 space-y-2 lg:hidden">
            {visibles.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setEditando(l)}
                  className="w-full rounded-lg border border-line bg-white px-4 py-3 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.motivo ?? "—"}</p>
                      <p className="text-xs text-ink/50">
                        {l.cliente} · {l.piso ?? "—"} · {fecha(l.entrada)} →{" "}
                        {fecha(l.salida)}
                        {l.noches != null && ` · ${l.noches} n.`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-medium">
                        {eur(esCheckin ? l.precio : l.facturado_neto)}
                      </p>
                      <p className="text-xs text-ink/50">
                        {l.numero ?? l.servicio}
                      </p>
                      {!esCheckin && l.coste_mo_bruto != null && (
                        <p className="text-xs text-ink/40">
                          MO {eur(l.coste_mo_bruto)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {editando && (
        <EditarLinea
          linea={editando === "nueva" ? null : editando}
          servicios={PESTANAS.find((p) => p.clave === pestana)!.servicios}
          clientes={clientes}
          origenes={origenes}
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

function Total({
  etiqueta,
  valor,
  sub,
}: {
  etiqueta: string;
  valor: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2.5">
      <p className="text-xs text-ink/50">{etiqueta}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{valor}</p>
      {sub && <p className="text-xs text-ink/40">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edición / alta. Las líneas que vienen de una reserva solo editan MO y ajustes:
// el resto de datos se cambia en Entradas.

function EditarLinea({
  linea,
  servicios,
  clientes,
  origenes,
  onCerrar,
  onGuardado,
}: {
  linea: Linea | null;
  servicios: string[];
  clientes: Cliente[];
  origenes: Origen[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const deReserva = !!linea?.reserva_id;
  const s = (v: unknown) => (v == null ? "" : String(v));
  const [f, setF] = useState({
    cliente_id: linea?.cliente_id ?? clientes[0]?.id ?? "",
    servicio: linea?.servicio ?? servicios[0],
    motivo: s(linea?.motivo),
    documento: s(linea?.documento),
    codigo_reserva: s(linea?.codigo_reserva),
    origen_codigo: s(linea?.origen_codigo),
    comision_portal: s(linea?.comision_portal),
    precio: s(linea?.precio),
    fecha_reserva: s(linea?.fecha_reserva),
    entrada: s(linea?.entrada),
    salida: s(linea?.salida),
    fecha_pago: s(linea?.fecha_pago),
    forma_pago: s(linea?.forma_pago),
    piso: s(linea?.piso),
    horas_mo: s(linea?.horas_mo),
    mo: s(linea?.mo),
    mo_si_no: s(linea?.mo_si_no),
    horario: s(linea?.horario),
    facturado_bruto: s(linea?.facturado_bruto),
    pct_comision: s(linea?.pct_comision_limpieza),
    iva_pct: s(linea?.iva_pct),
    mo_unitario_bruto: s(linea?.mo_unitario_bruto),
    mo_unitario_neto: s(linea?.mo_unitario_neto),
    facturado_neto_manual: s(linea?.facturado_neto_manual),
    coste_mo_bruto_manual: s(linea?.coste_mo_bruto_manual),
    coste_mo_neto_manual: s(linea?.coste_mo_neto_manual),
  });
  const esCheckin = f.servicio === "Checkin";
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value }));
  const n = (v: string) =>
    v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", "."));
  const t = (v: string) => (v.trim() === "" ? null : v.trim());

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const comunes = {
      horas_mo: n(f.horas_mo),
      mo: t(f.mo),
      mo_si_no: t(f.mo_si_no),
      horario: t(f.horario),
      // Tarifas de la línea: en una línea nueva, si se dejan vacías se copian las del cliente.
      facturado_bruto: n(f.facturado_bruto),
      pct_comision: n(f.pct_comision),
      iva_pct: n(f.iva_pct),
      mo_unitario_bruto: n(f.mo_unitario_bruto),
      mo_unitario_neto: n(f.mo_unitario_neto),
      facturado_neto_manual: n(f.facturado_neto_manual),
      coste_mo_bruto_manual: n(f.coste_mo_bruto_manual),
      coste_mo_neto_manual: n(f.coste_mo_neto_manual),
    };
    const propios = deReserva
      ? {}
      : {
          cliente_id: f.cliente_id,
          servicio: f.servicio,
          motivo: t(f.motivo),
          documento: t(f.documento),
          codigo_reserva: t(f.codigo_reserva),
          origen_codigo: t(f.origen_codigo),
          comision_portal: n(f.comision_portal),
          precio: n(f.precio),
          fecha_reserva: t(f.fecha_reserva),
          entrada: t(f.entrada),
          salida: t(f.salida),
          fecha_pago: t(f.fecha_pago),
          forma_pago: t(f.forma_pago),
          piso: t(f.piso),
        };
    const valores = { ...comunes, ...propios };
    if (
      Object.values(valores).some(
        (v) => typeof v === "number" && Number.isNaN(v),
      )
    ) {
      return setError("Revisa los importes: deben ser números.");
    }
    if (!deReserva && !f.cliente_id) return setError("Elige el cliente.");
    setGuardando(true);
    const { error: err } = linea
      ? await supabase.from("ingresos").update(valores).eq("id", linea.id)
      : await supabase
          .from("ingresos")
          .insert({ ...valores, origen_datos: "manual" });
    setGuardando(false);
    if (err) return setError(err.message);
    onGuardado();
  }

  async function borrar() {
    if (!linea || deReserva) return;
    if (!window.confirm("¿Borrar esta línea de ingresos?")) return;
    const { error: err } = await supabase
      .from("ingresos")
      .delete()
      .eq("id", linea.id);
    if (err) return setError(err.message);
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:px-4">
      <form
        onSubmit={guardar}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-lg sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">
            {linea
              ? `${linea.servicio} ${linea.numero ?? ""}`
              : `Nueva línea · ${servicios[0]}`}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            className="text-sm text-ink/50 hover:text-ink"
          >
            Cerrar
          </button>
        </div>

        {deReserva && linea && (
          <div className="mt-4 rounded-md border border-line bg-paper p-3 text-sm">
            <p className="font-medium">{linea.motivo}</p>
            <p className="text-xs text-ink/60">
              {linea.cliente} · {linea.piso} · {fecha(linea.entrada)} →{" "}
              {fecha(linea.salida)}
              {linea.servicio === "Checkin" && ` · ${eur(linea.precio)}`}
              {linea.servicio === "Checkin" &&
                linea.comision_portal != null &&
                ` (comisión ${eur(linea.comision_portal)})`}
            </p>
            <p className="mt-1 text-xs text-ink/50">
              Viene de una reserva de Entradas: titular, fechas, piso, importes,
              origen y pago se cambian allí.
            </p>
          </div>
        )}

        {!deReserva && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Cliente">
              <select value={f.cliente_id} onChange={set("cliente_id")}>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo ? `${c.codigo} · ` : ""}
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Servicio">
              <select value={f.servicio} onChange={set("servicio")}>
                {servicios.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta={esCheckin ? "Motivo (titular)" : "Motivo"}>
              <input value={f.motivo} onChange={set("motivo")} />
            </Campo>
            <Campo etiqueta="Piso">
              <input value={f.piso} onChange={set("piso")} />
            </Campo>
            <Campo etiqueta="Entrada">
              <input type="date" value={f.entrada} onChange={set("entrada")} />
            </Campo>
            <Campo etiqueta="Salida">
              <input type="date" value={f.salida} onChange={set("salida")} />
            </Campo>
            {f.servicio !== "Gestión" && (
              <>
                <Campo etiqueta="Precio reserva">
                  <input
                    inputMode="decimal"
                    value={f.precio}
                    onChange={set("precio")}
                  />
                </Campo>
                <Campo etiqueta="Comisión portal">
                  <input
                    inputMode="decimal"
                    value={f.comision_portal}
                    onChange={set("comision_portal")}
                  />
                </Campo>
                <Campo etiqueta="Origen">
                  <select
                    value={f.origen_codigo}
                    onChange={set("origen_codigo")}
                  >
                    <option value="">—</option>
                    {origenes.map((o) => (
                      <option key={o.codigo} value={o.codigo}>
                        {o.nombre}
                      </option>
                    ))}
                    {f.origen_codigo &&
                      !origenes.some((o) => o.codigo === f.origen_codigo) && (
                        <option value={f.origen_codigo}>
                          {f.origen_codigo}
                        </option>
                      )}
                  </select>
                </Campo>
                <Campo etiqueta="Código de reserva">
                  <input
                    value={f.codigo_reserva}
                    onChange={set("codigo_reserva")}
                  />
                </Campo>
                <Campo etiqueta="Fecha de reserva">
                  <input
                    type="date"
                    value={f.fecha_reserva}
                    onChange={set("fecha_reserva")}
                  />
                </Campo>
                <Campo etiqueta="Documento">
                  <input value={f.documento} onChange={set("documento")} />
                </Campo>
                <Campo etiqueta="Fecha de pago">
                  <input
                    type="date"
                    value={f.fecha_pago}
                    onChange={set("fecha_pago")}
                  />
                </Campo>
                <Campo etiqueta="Forma de pago">
                  <input value={f.forma_pago} onChange={set("forma_pago")} />
                </Campo>
              </>
            )}
          </div>
        )}

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-ink/50">
          Mano de obra
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Campo etiqueta="Horas MO">
            <input
              inputMode="decimal"
              value={f.horas_mo}
              onChange={set("horas_mo")}
            />
          </Campo>
          <Campo etiqueta="MO (persona)">
            <input value={f.mo} onChange={set("mo")} />
          </Campo>
          <Campo etiqueta="Sí / No">
            <select value={f.mo_si_no} onChange={set("mo_si_no")}>
              <option value="">—</option>
              <option>Si</option>
              <option>No</option>
            </select>
          </Campo>
          <Campo etiqueta="Horario">
            <input value={f.horario} onChange={set("horario")} />
          </Campo>
        </div>

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-ink/50">
          Tarifas de esta línea
        </p>
        <p className="mt-0.5 text-xs text-ink/40">
          {linea
            ? "Se fijaron al crear la línea; cambiarlas aquí solo afecta a esta línea."
            : "Déjalas vacías para usar las tarifas actuales del cliente (Administración → Servicios por cliente)."}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Campo etiqueta="Facturado Botones">
            <input
              inputMode="decimal"
              value={f.facturado_bruto}
              onChange={set("facturado_bruto")}
            />
          </Campo>
          <Campo etiqueta="% comisión">
            <input
              inputMode="decimal"
              value={f.pct_comision}
              onChange={set("pct_comision")}
            />
          </Campo>
          <Campo etiqueta="% IVA">
            <input
              inputMode="decimal"
              value={f.iva_pct}
              onChange={set("iva_pct")}
            />
          </Campo>
          <Campo etiqueta="Hora MO bruto">
            <input
              inputMode="decimal"
              value={f.mo_unitario_bruto}
              onChange={set("mo_unitario_bruto")}
            />
          </Campo>
          <Campo etiqueta="Hora MO neto">
            <input
              inputMode="decimal"
              value={f.mo_unitario_neto}
              onChange={set("mo_unitario_neto")}
            />
          </Campo>
        </div>

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-ink/50">
          Ajustes manuales
        </p>
        <p className="mt-0.5 text-xs text-ink/40">
          Si se rellenan, prevalecen sobre el cálculo (como un valor escrito a
          mano en el Sheet).
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Campo etiqueta="Botones neto">
            <input
              inputMode="decimal"
              value={f.facturado_neto_manual}
              onChange={set("facturado_neto_manual")}
            />
          </Campo>
          <Campo etiqueta="Coste MO bruto">
            <input
              inputMode="decimal"
              value={f.coste_mo_bruto_manual}
              onChange={set("coste_mo_bruto_manual")}
            />
          </Campo>
          <Campo etiqueta="Coste MO neto">
            <input
              inputMode="decimal"
              value={f.coste_mo_neto_manual}
              onChange={set("coste_mo_neto_manual")}
            />
          </Campo>
        </div>

        {linea && (
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-paper p-3 text-xs sm:grid-cols-3">
            <Dato k="Sin comisión" v={eur(linea.precio_sin_comision)} />
            <Dato k="Sin IVA" v={eur(linea.precio_sin_iva)} />
            <Dato k="Botones neto" v={eur(linea.facturado_neto)} />
            <Dato k="Coste MO bruto" v={eur(linea.coste_mo_bruto)} />
            <Dato k="Coste MO neto" v={eur(linea.coste_mo_neto)} />
            <Dato
              k="Noches"
              v={linea.noches != null ? String(linea.noches) : "—"}
            />
            <Dato
              k="% ocupación"
              v={
                linea.pct_ocupacion != null
                  ? `${num(linea.pct_ocupacion, 3)} %`
                  : "—"
              }
            />
          </dl>
        )}

        <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 flex items-center justify-end gap-3 border-t border-line bg-white px-5 py-3 sm:-mx-6 sm:-mb-6 sm:px-6">
          {error && <span className="mr-auto text-xs text-clay">{error}</span>}
          {linea && !deReserva && (
            <button
              type="button"
              onClick={borrar}
              className="mr-auto text-xs text-clay underline"
            >
              Borrar línea
            </button>
          )}
          <button
            type="button"
            onClick={onCerrar}
            className="text-sm text-ink/60 hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Fuera de EditarLinea para que los campos no se recreen (y pierdan el foco) en cada pulsación.
function Campo({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label>{etiqueta}</label>
      {children}
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink/50">{k}</dt>
      <dd className="font-medium tabular-nums">{v}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gestión: líneas agrupadas por cliente, piso y mes; importe provisional del mes en curso.

const nombreMes = (iso: string) => {
  const [a, m] = iso.split("-");
  return `${MESES[Number(m) - 1]} ${a}`;
};

type Provisional = {
  cliente_id: string;
  cliente: string;
  piso: string;
  orden: number;
  motivo: string;
  importe: number;
  facturacion: number;
  regla_desde: string;
};

function GestionProvisional() {
  const supabase = useMemo(() => createClient(), []);
  const hoy = new Date();
  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
  const [filas, setFilas] = useState<Provisional[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.rpc("gestion_provisional", { p_mes: mes }).then(({ data, error: err }) => {
      if (err) setError(err.message);
      setFilas((data as Provisional[]) ?? []);
    });
  }, [supabase, mes]);

  const grupos = useMemo(() => {
    const m = new Map<string, Provisional[]>();
    for (const f of filas ?? []) {
      const k = `${f.cliente}|${f.piso}`;
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    return Array.from(m.values());
  }, [filas]);

  return (
    <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Gestión provisional · {nombreMes(mes)}</h2>
        <p className="text-xs text-ink/50">
          Calculada con las entradas registradas hasta hoy. Se consolida al cerrar el mes.
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-clay">{error}</p>}
      {filas === null ? (
        <p className="mt-2 text-sm text-ink/40">Calculando…</p>
      ) : grupos.length === 0 ? (
        <p className="mt-2 text-sm text-ink/40">Ningún cliente tiene reglas de gestión vigentes.</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grupos.map((g) => (
            <div key={`${g[0].cliente}|${g[0].piso}`} className="rounded-md border border-line bg-white p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">
                  {g[0].cliente} · {g[0].piso}
                </p>
                <p className="text-lg font-semibold tabular-nums">{eur(g.reduce((s, f) => s + Number(f.importe), 0))}</p>
              </div>
              <p className="text-xs text-ink/50">
                Facturación del mes {eur(g[0].facturacion)} · regla desde {fecha(g[0].regla_desde)}
              </p>
              {g.length > 1 && (
                <ul className="mt-2 space-y-0.5 text-xs text-ink/70">
                  {g.map((f) => (
                    <li key={f.orden} className="flex justify-between gap-2">
                      <span className="truncate">{f.motivo}</span>
                      <span className="tabular-nums">{num(f.importe)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GestionAgrupada({
  lineas,
  onEditar,
  onRecalculado,
}: {
  lineas: Linea[];
  onEditar: (l: Linea) => void;
  onRecalculado: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [recalculando, setRecalculando] = useState("");
  const [error, setError] = useState("");

  const grupos = useMemo(() => {
    const m = new Map<string, Linea[]>();
    for (const l of lineas) {
      const k = `${l.entrada?.slice(0, 7) ?? "—"}|${l.cliente}|${l.piso ?? "—"}`;
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    // Más reciente primero; dentro del mes, por cliente y piso.
    return Array.from(m.entries())
      .sort(([a], [b]) => {
        const [ma, ...ra] = a.split("|");
        const [mb, ...rb] = b.split("|");
        return mb.localeCompare(ma) || ra.join().localeCompare(rb.join());
      })
      .map(([k, ls]) => ({ k, ls }));
  }, [lineas]);

  async function recalcular(l: Linea) {
    if (!l.entrada) return;
    const mes = `${l.entrada.slice(0, 7)}-01`;
    if (
      !window.confirm(
        `¿Recalcular la gestión de ${l.cliente} de ${nombreMes(mes)} con las reglas y entradas actuales?\n\n` +
          "Las líneas automáticas se rehacen (se pierden los importes que hayas cambiado en ellas). Las líneas añadidas a mano se mantienen.",
      )
    )
      return;
    setRecalculando(l.cliente_id + mes);
    setError("");
    const { error: err } = await supabase.rpc("recalcular_gestion", { p_mes: mes, p_cliente: l.cliente_id });
    setRecalculando("");
    if (err) return setError(err.message);
    onRecalculado();
  }

  return (
    <div className="mt-3 space-y-3">
      {error && <p className="text-sm text-clay">{error}</p>}
      {grupos.map(({ k, ls }) => {
        const l0 = ls[0];
        const deRegla = ls.some((l) => l.origen_datos === "regla");
        const mes = l0.entrada ? `${l0.entrada.slice(0, 7)}-01` : "";
        return (
          <section key={k} className="overflow-hidden rounded-lg border border-line bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-4 py-2">
              <p className="text-sm font-semibold">
                {l0.cliente} · {l0.piso ?? "—"} · {mes ? nombreMes(mes) : "Sin fecha"}
              </p>
              <div className="flex items-center gap-3 text-sm">
                {deRegla && (
                  <button
                    type="button"
                    onClick={() => recalcular(l0)}
                    disabled={!!recalculando}
                    className="text-xs text-ink/60 underline hover:text-ink disabled:opacity-50"
                  >
                    {recalculando === l0.cliente_id + mes ? "Recalculando…" : "Recalcular"}
                  </button>
                )}
                <span className="font-semibold tabular-nums">{eur(suma(ls, "facturado_neto"))}</span>
              </div>
            </header>
            <ul className="divide-y divide-line">
              {ls.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-1.5 text-sm hover:bg-paper">
                  <button type="button" onClick={() => onEditar(l)} className="min-w-0 flex-1 truncate py-1 text-left">
                    {l.motivo ?? "—"}
                    {l.origen_datos === "regla" ? (
                      <span className="ml-2 rounded bg-emerald-50 px-1 text-xs text-emerald-800">auto</span>
                    ) : l.origen_datos === "manual" ? (
                      <span className="ml-2 rounded bg-amber-50 px-1 text-xs text-amber-800">manual</span>
                    ) : null}
                    {l.servicio === "Servicios" && (
                      <span className="ml-2 rounded bg-sky-100 px-1 text-xs text-sky-900">Servicios</span>
                    )}
                  </button>
                  <span className="flex shrink-0 items-center gap-3 tabular-nums">
                    {l.coste_mo_bruto != null && <span className="text-xs text-ink/50">MO {num(l.coste_mo_bruto)}</span>}
                    <ImporteEditable linea={l} onGuardado={onRecalculado} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// Importe (Facturado Botones bruto) editable en la propia línea: se guarda al salir del campo.
function ImporteEditable({ linea, onGuardado }: { linea: Linea; onGuardado: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const inicial = linea.facturado_bruto == null ? "" : String(linea.facturado_bruto).replace(".", ",");
  const [v, setV] = useState(inicial);
  const [estado, setEstado] = useState<"" | "guardando" | "error">("");

  async function guardar() {
    if (v === inicial) return;
    const n = v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    if (n != null && Number.isNaN(n)) {
      setEstado("error");
      return;
    }
    setEstado("guardando");
    const { error } = await supabase.from("ingresos").update({ facturado_bruto: n }).eq("id", linea.id);
    setEstado(error ? "error" : "");
    if (!error) onGuardado();
  }

  return (
    <input
      aria-label={`Importe de ${linea.motivo ?? "la línea"}`}
      inputMode="decimal"
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        setEstado("");
      }}
      onBlur={guardar}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      disabled={estado === "guardando"}
      title={estado === "error" ? "No se ha podido guardar: revisa el número" : "Importe facturado (editable)"}
      className={`w-28 rounded border px-2 py-1 text-right ${estado === "error" ? "border-clay" : "border-line"}`}
    />
  );
}
