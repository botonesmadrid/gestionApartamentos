"use client";

// Ficha de una factura: vista tipo factura, edición de líneas mientras está en borrador, emisión,
// PDF (con el detalle de reservas del periodo) y envío por email.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EstadoFactura } from "../FacturacionView";

type Factura = {
  id: string;
  numero: string;
  serie_id: string | null;
  cliente_id: string | null;
  fecha: string;
  periodo_desde: string | null;
  periodo_hasta: string | null;
  destinatario_nombre: string | null;
  destinatario_nif: string | null;
  destinatario_direccion: string | null;
  irpf_pct: number;
  iva_pct: number;
  base: number;
  irpf: number;
  iva: number;
  total: number;
  estado: "borrador" | "emitida" | "anulada";
  origen: "app" | "historico";
  enviada_at: string | null;
  enviada_a: string | null;
  notas: string | null;
};
type Linea = { id: string; orden: number; concepto: string; cantidad: number; precio: number; importe: number; ingreso_ids: string[] | null };
type Reserva = {
  id: string;
  numero: string | null;
  motivo: string | null;
  codigo_reserva: string | null;
  origen_codigo: string | null;
  piso: string | null;
  entrada: string | null;
  salida: string | null;
  noches: number | null;
  precio: number | null;
  comision_portal: number | null;
  precio_sin_comision: number | null;
};

const eur = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const num = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const periodo = (d: string | null) => (d ? `${MESES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}` : "");
const n = (v: string) => (v.trim() === "" ? 0 : Number(v.replace(/\s/g, "").replace(",", ".")));

export default function FacturaDetalle({ id }: { id: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState<Factura | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [emails, setEmails] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState("");

  async function cargar() {
    const { data: fac, error: err } = await supabase.from("facturas").select("*").eq("id", id).single();
    if (err || !fac) return setError(err?.message ?? "No se encuentra la factura.");
    setF(fac as Factura);
    const { data: ls } = await supabase.from("facturas_lineas").select("*").eq("factura_id", id).order("orden");
    setLineas((ls as Linea[]) ?? []);
    if (fac.cliente_id) {
      const { data: c } = await supabase.from("clientes").select("emails_facturacion").eq("id", fac.cliente_id).single();
      setEmails(c?.emails_facturacion ?? "");
      if (fac.origen === "app" && fac.periodo_desde && fac.periodo_hasta) {
        const { data: r } = await supabase
          .from("v_ingresos")
          .select("id, numero, motivo, codigo_reserva, origen_codigo, piso, entrada, salida, noches, precio, comision_portal, precio_sin_comision")
          .eq("cliente_id", fac.cliente_id)
          .eq("servicio", "Checkin")
          .gte("entrada", fac.periodo_desde)
          .lte("entrada", fac.periodo_hasta)
          .order("entrada");
        setReservas((r as Reserva[]) ?? []);
      }
    }
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!f) return <p className="py-10 text-center text-sm text-ink/40">{error || "Cargando…"}</p>;
  const editable = f.estado === "borrador" && f.origen === "app";

  async function accion(nombre: string, fn: () => Promise<{ error: { message: string } | null }>, ok?: string) {
    setOcupado(nombre);
    setError("");
    setAviso("");
    const { error: err } = await fn();
    setOcupado("");
    if (err) return setError(err.message);
    if (ok) setAviso(ok);
    cargar();
  }

  async function guardarCabecera(campo: keyof Factura, valor: string | number) {
    await accion("cab", async () => await supabase.from("facturas").update({ [campo]: valor }).eq("id", f!.id));
  }

  async function descargarPdf() {
    setOcupado("pdf");
    setError("");
    const { data, error: err } = await supabase.functions.invoke("factura", { body: { id: f!.id, accion: "pdf" } });
    setOcupado("");
    if (err || !(data instanceof Blob)) return setError("No se ha podido generar el PDF.");
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Factura_${f!.numero}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function enviar() {
    setOcupado("enviar");
    setError("");
    setAviso("");
    const { data, error: err } = await supabase.functions.invoke("factura", { body: { id: f!.id, accion: "enviar", para } });
    setOcupado("");
    if (err) {
      let detalle = "";
      try {
        detalle = (await (err as { context?: Response }).context?.json())?.error ?? "";
      } catch {}
      const textos: Record<string, string> = {
        sin_destinatarios: "No hay destinatarios: añade los emails de facturación del cliente (Maestros → Clientes) o escríbelos aquí.",
        email_invalido: "Algún email no es válido.",
        no_emitida: "Emite la factura antes de enviarla.",
        gmail: "Gmail no ha aceptado el envío. Vuelve a intentarlo más tarde.",
      };
      return setError(textos[detalle] ?? "No se ha podido enviar la factura.");
    }
    setEnviando(false);
    setAviso(`Enviada a ${(data as { para?: string[] })?.para?.join(", ") ?? "los destinatarios"}.`);
    cargar();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/facturacion" className="text-sm text-ink/60 hover:text-ink">
          ← Facturación
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {editable && f.serie_id && (
            <button
              type="button"
              disabled={!!ocupado}
              onClick={() =>
                accion("regen", async () => await supabase.rpc("generar_facturas", { p_mes: f.periodo_desde, p_cliente: f.cliente_id }), "Factura rehecha con los datos actuales de Ingresos (las líneas manuales se mantienen).")
              }
              className="rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:bg-paper disabled:opacity-50"
            >
              {ocupado === "regen" ? "Recalculando…" : "Recalcular desde Ingresos"}
            </button>
          )}
          {editable && (
            <button
              type="button"
              disabled={!!ocupado}
              onClick={() => {
                if (!window.confirm(`¿Emitir la factura ${f.numero} por ${eur(f.total)}? Después ya no se podrá modificar y se anotará en el libro de facturas.`)) return;
                accion("emitir", async () => await supabase.rpc("emitir_factura", { p_factura: f.id }), "Factura emitida y anotada en Gastos → Facturas.");
              }}
              className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper disabled:opacity-50"
            >
              Emitir
            </button>
          )}
          <button
            type="button"
            disabled={!!ocupado}
            onClick={descargarPdf}
            className="rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:bg-paper disabled:opacity-50"
          >
            {ocupado === "pdf" ? "Generando…" : "Descargar PDF"}
          </button>
          {f.estado === "emitida" && f.origen === "app" && (
            <button
              type="button"
              onClick={() => {
                setPara(emails);
                setEnviando(true);
              }}
              className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper"
            >
              {f.enviada_at ? "Reenviar por email" : "Enviar por email"}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-clay">{error}</p>}
      {aviso && <p className="mt-3 text-sm text-emerald-700">{aviso}</p>}
      {f.enviada_at && (
        <p className="mt-2 text-xs text-ink/50">
          Enviada el {new Date(f.enviada_at).toLocaleString("es-ES")} a {f.enviada_a}
        </p>
      )}

      {enviando && (
        <div className="mt-3 rounded-lg border border-line bg-white p-4">
          <label htmlFor="para">Enviar a (separa varios emails con comas)</label>
          <input id="para" value={para} onChange={(e) => setPara(e.target.value)} placeholder="cliente@ejemplo.com" />
          <p className="mt-1 text-xs text-ink/50">
            Se envía desde hola@botonesmadrid.com con la plantilla de Administración → Facturación y el PDF adjunto.
          </p>
          <div className="mt-3 flex justify-end gap-3">
            <button type="button" onClick={() => setEnviando(false)} className="text-sm text-ink/60 hover:text-ink">
              Cancelar
            </button>
            <button type="button" disabled={ocupado === "enviar"} onClick={enviar} className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-paper disabled:opacity-50">
              {ocupado === "enviar" ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </div>
      )}

      {/* Factura */}
      <article className="mt-4 rounded-lg border border-line bg-white p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">Factura {f.numero}</h1>
            <p className="mt-1 text-sm text-ink/60">
              {fecha(f.fecha)} · {periodo(f.periodo_desde)}
            </p>
          </div>
          <EstadoFactura f={f} />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {editable ? (
            <>
              <CampoGuardado etiqueta="Cliente / destinatario" valor={f.destinatario_nombre ?? ""} onGuardar={(v) => guardarCabecera("destinatario_nombre", v)} />
              <CampoGuardado etiqueta="CIF/NIF/NIE" valor={f.destinatario_nif ?? ""} onGuardar={(v) => guardarCabecera("destinatario_nif", v)} />
              <CampoGuardado etiqueta="Dirección" valor={f.destinatario_direccion ?? ""} onGuardar={(v) => guardarCabecera("destinatario_direccion", v)} />
              <CampoGuardado etiqueta="Fecha de factura" tipo="date" valor={f.fecha} onGuardar={(v) => guardarCabecera("fecha", v)} />
            </>
          ) : (
            <div className="text-sm">
              <p className="font-medium">{f.destinatario_nombre}</p>
              {f.destinatario_nif && <p className="text-ink/60">CIF/NIF/NIE: {f.destinatario_nif}</p>}
              {f.destinatario_direccion && <p className="text-ink/60">{f.destinatario_direccion}</p>}
            </div>
          )}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink/50">
                <th className="py-2 pr-2 font-medium">Concepto</th>
                <th className="w-20 px-2 py-2 text-right font-medium">Cant.</th>
                <th className="w-28 px-2 py-2 text-right font-medium">Precio</th>
                <th className="w-28 py-2 pl-2 text-right font-medium">Importe</th>
                {editable && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) =>
                editable ? (
                  <LineaEditable key={l.id + l.importe} l={l} onCambio={cargar} />
                ) : (
                  <tr key={l.id} className="border-b border-line">
                    <td className="whitespace-pre-line py-2 pr-2">{l.concepto}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{Number(l.cantidad).toLocaleString("es-ES")}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{num(l.precio)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{num(l.importe)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          {editable && (
            <button
              type="button"
              onClick={() =>
                accion("linea", async () =>
                  await supabase.from("facturas_lineas").insert({ factura_id: f.id, orden: (lineas.at(-1)?.orden ?? 0) + 1, concepto: "Nuevo concepto", cantidad: 1, precio: 0 }),
                )
              }
              className="mt-2 text-sm text-ink/60 underline hover:text-ink"
            >
              + Añadir concepto (reparaciones, extras…)
            </button>
          )}
        </div>

        <dl className="ml-auto mt-6 max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink/60">Total neto</dt>
            <dd className="tabular-nums">{eur(f.base)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink/60">
              IRPF{" "}
              {editable ? (
                <input
                  aria-label="% IRPF"
                  defaultValue={String(f.irpf_pct)}
                  onBlur={(e) => n(e.target.value) !== Number(f.irpf_pct) && guardarCabecera("irpf_pct", n(e.target.value))}
                  className="inline w-14 rounded border border-line px-1 py-0.5 text-right"
                />
              ) : (
                Number(f.irpf_pct)
              )}
              %
            </dt>
            <dd className="tabular-nums">{Number(f.irpf) ? `- ${eur(f.irpf)}` : "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink/60">
              IVA{" "}
              {editable ? (
                <input
                  aria-label="% IVA"
                  defaultValue={String(f.iva_pct)}
                  onBlur={(e) => n(e.target.value) !== Number(f.iva_pct) && guardarCabecera("iva_pct", n(e.target.value))}
                  className="inline w-14 rounded border border-line px-1 py-0.5 text-right"
                />
              ) : (
                Number(f.iva_pct)
              )}
              %
            </dt>
            <dd className="tabular-nums">{eur(f.iva)}</dd>
          </div>
          <div className="flex justify-between border-t border-ink pt-1 text-base font-semibold">
            <dt>Total factura</dt>
            <dd className="tabular-nums">{eur(f.total)}</dd>
          </div>
        </dl>
      </article>

      {/* Reporting del periodo */}
      {reservas.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Detalle de reservas del periodo ({reservas.length})</h2>
          <p className="text-xs text-ink/50">Se incluye en el PDF como anexo.</p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink/50">
                  <th className="px-3 py-2 font-medium">Nº</th>
                  <th className="px-2 py-2 font-medium">Huésped</th>
                  <th className="px-2 py-2 font-medium">Origen</th>
                  <th className="px-2 py-2 font-medium">Piso</th>
                  <th className="px-2 py-2 font-medium">Entrada → Salida</th>
                  <th className="px-2 py-2 text-right font-medium">Noches</th>
                  <th className="px-2 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 text-right font-medium">Sin comisión</th>
                </tr>
              </thead>
              <tbody>
                {reservas.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5 text-xs text-ink/60">{r.numero ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.motivo ?? "—"}</td>
                    <td className="px-2 py-1.5 text-xs">{r.origen_codigo ?? "—"}</td>
                    <td className="px-2 py-1.5 text-xs">{r.piso ?? "—"}</td>
                    <td className="px-2 py-1.5 text-xs">
                      {fecha(r.entrada)} → {fecha(r.salida)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.noches ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(r.precio)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{num(r.precio_sin_comision)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function CampoGuardado({ etiqueta, valor, tipo, onGuardar }: { etiqueta: string; valor: string; tipo?: string; onGuardar: (v: string) => void }) {
  const [v, setV] = useState(valor);
  return (
    <div>
      <label>{etiqueta}</label>
      <input type={tipo} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== valor && onGuardar(v)} />
    </div>
  );
}

// Línea editable en borrador: se guarda al salir del campo.
function LineaEditable({ l, onCambio }: { l: Linea; onCambio: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [c, setC] = useState(l.concepto);
  const [q, setQ] = useState(String(l.cantidad).replace(".", ","));
  const [p, setP] = useState(String(l.precio).replace(".", ","));
  const [err, setErr] = useState(false);

  async function guardar() {
    const cantidad = n(q);
    const precio = n(p);
    if (Number.isNaN(cantidad) || Number.isNaN(precio) || !c.trim()) return setErr(true);
    if (c === l.concepto && cantidad === Number(l.cantidad) && precio === Number(l.precio)) return;
    const { error } = await supabase.from("facturas_lineas").update({ concepto: c.trim(), cantidad, precio }).eq("id", l.id);
    setErr(!!error);
    if (!error) onCambio();
  }
  async function borrar() {
    if (!window.confirm("¿Quitar este concepto de la factura?")) return;
    const { error } = await supabase.from("facturas_lineas").delete().eq("id", l.id);
    if (!error) onCambio();
  }
  const cls = `w-full rounded border px-2 py-1 ${err ? "border-clay" : "border-line"}`;
  return (
    <tr className="border-b border-line">
      <td className="py-1.5 pr-2">
        <textarea rows={c.includes("\n") ? 2 : 1} value={c} onChange={(e) => setC(e.target.value)} onBlur={guardar} className={`${cls} resize-y`} />
        {!l.ingreso_ids && <span className="text-[11px] text-amber-700">manual</span>}
      </td>
      <td className="px-2 py-1.5">
        <input inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} onBlur={guardar} className={`${cls} text-right`} />
      </td>
      <td className="px-2 py-1.5">
        <input inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} onBlur={guardar} className={`${cls} text-right`} />
      </td>
      <td className="py-1.5 pl-2 text-right tabular-nums">{num(l.importe)}</td>
      <td className="pl-2">
        <button type="button" onClick={borrar} aria-label="Quitar concepto" className="text-ink/40 hover:text-clay">
          ×
        </button>
      </td>
    </tr>
  );
}
