"use client";

// Correos que no se han podido aplicar solos (avisos_canal.resultado = 'revisar'), en dos botones:
//  * reservas: avisos de Avirato y Little Hotelier → Reintentar (tras corregir el motivo) o Descartar.
//  * contratos: firmas de HelloSign sin entrada → Asignar a entrada o Descartar.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Tipo = "reservas" | "contratos";
type Aviso = {
  id: string;
  canal: string;
  recibido_at: string | null;
  asunto: string | null;
  detalle: string | null;
  datos: {
    tipo?: string;
    cliente?: string;
    entrada?: string;
    salida?: string;
    codigo?: string;
    firmante?: string | null;
    email?: string | null;
    titulo?: string | null;
  } | null;
};
type Candidata = {
  id: string;
  fecha_entrada: string;
  fecha_salida: string;
  nombre: string;
  apellido1: string | null;
  contrato_firmado_at: string | null;
  apartamentos: { piso: string; clientes: { codigo: string | null; nombre: string } | null } | null;
};

const CANALES_RESERVAS = ["avirato", "littlehotelier"];
const CANALES: Record<string, string> = { avirato: "Avirato", littlehotelier: "Little Hotelier", hellosign: "Firma de contrato" };
const TIPOS: Record<string, string> = { alta: "Reserva nueva", modificacion: "Modificación", cancelacion: "Cancelación" };
const fecha = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const TEXTOS: Record<Tipo, { boton: (n: number) => string; titulo: string }> = {
  reservas: {
    boton: (n) => (n === 1 ? "1 correo de reservas sin aplicar" : `${n} correos de reservas sin aplicar`),
    titulo: "Correos de reservas sin aplicar",
  },
  contratos: {
    boton: (n) => (n === 1 ? "1 contrato firmado sin asignar" : `${n} contratos firmados sin asignar`),
    titulo: "Contratos firmados sin asignar",
  },
};

export default function AvisosRevisar({ tipo, onCambio }: { tipo: Tipo; onCambio: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    let q = supabase
      .from("avisos_canal")
      .select("id, canal, recibido_at, asunto, detalle, datos")
      .eq("resultado", "revisar")
      .is("descartado_at", null)
      .order("recibido_at");
    q = tipo === "reservas" ? q.in("canal", CANALES_RESERVAS) : q.eq("canal", "hellosign");
    const { data } = await q;
    setAvisos((data as Aviso[]) ?? []);
  }, [supabase, tipo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (abierto && !avisos.length) setAbierto(false);
  }, [abierto, avisos.length]);

  if (!avisos.length) return null;
  const textos = TEXTOS[tipo];
  const onHecho = () => {
    cargar();
    onCambio();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
      >
        {textos.boton(avisos.length)}
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:px-4" onClick={() => setAbierto(false)}>
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">{textos.titulo}</h2>
                {tipo === "reservas" ? (
                  <p className="mt-1 text-sm text-ink/60">
                    Avisos de reservas que no se han podido meter solos en Entradas. Corrige el motivo (p. ej. el ID de la
                    habitación en{" "}
                    <Link href="/admin/maestros/apartamentos" className="underline">
                      Maestros
                    </Link>
                    ) y pulsa Reintentar, o descártalo si no hay nada que hacer.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-ink/60">
                    Contratos firmados cuya entrada no se ha encontrado sola. Asígnalos a su entrada: queda como firmada y el
                    PDF firmado se guarda en su carpeta de Drive en unos minutos.
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setAbierto(false)} className="text-sm text-ink/50 hover:text-ink">
                Cerrar
              </button>
            </div>
            <ul className="mt-4 space-y-3">
              {avisos.map((a) =>
                tipo === "reservas" ? <TarjetaReserva key={a.id} aviso={a} onHecho={onHecho} /> : <TarjetaFirma key={a.id} aviso={a} onHecho={onHecho} />,
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function useDescartar(aviso: Aviso, onHecho: () => void, setMensaje: (m: string) => void, setOcupado: (b: boolean) => void) {
  const supabase = useMemo(() => createClient(), []);
  return async () => {
    if (!window.confirm("¿Descartar este aviso? No cambia ninguna entrada; solo deja de salir en esta lista.")) return;
    setOcupado(true);
    const { error } = await supabase.from("avisos_canal").update({ descartado_at: new Date().toISOString() }).eq("id", aviso.id);
    setOcupado(false);
    if (error) return setMensaje(error.message);
    onHecho();
  };
}

function TarjetaReserva({ aviso, onHecho }: { aviso: Aviso; onHecho: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const descartar = useDescartar(aviso, onHecho, setMensaje, setOcupado);
  const d = aviso.datos ?? {};
  const titulo = [d.tipo ? TIPOS[d.tipo] ?? d.tipo : null, d.cliente].filter(Boolean).join(" · ") || aviso.asunto || "Aviso";
  const sinPiso = /sin piso asignado/i.test(aviso.detalle ?? "");

  async function reintentar() {
    setOcupado(true);
    setMensaje("");
    const { data, error } = await supabase.rpc("reintentar_aviso", { p_aviso: aviso.id });
    setOcupado(false);
    if (error) return setMensaje(error.message);
    const r = data as { resultado?: string; detalle?: string | null } | null;
    if (r?.resultado === "revisar") {
      setMensaje(`Sigue sin poder aplicarse: ${r.detalle ?? "motivo desconocido"}`);
      // El aviso se ha vuelto a registrar con otro id: recargar la lista.
      setTimeout(onHecho, 2500);
      return;
    }
    onHecho();
  }

  return (
    <li className="rounded-lg border border-line px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{titulo}</p>
          <p className="text-xs text-ink/60">
            {CANALES[aviso.canal] ?? aviso.canal}
            {d.entrada ? ` · ${fecha(d.entrada)} → ${fecha(d.salida)}` : ""}
            {d.codigo ? ` · código ${d.codigo}` : ""} · recibido el {fecha(aviso.recibido_at)}
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <button type="button" disabled={ocupado} onClick={reintentar} className="text-xs font-medium underline disabled:opacity-50">
            Reintentar
          </button>
          <button type="button" disabled={ocupado} onClick={descartar} className="text-xs text-clay underline disabled:opacity-50">
            Descartar
          </button>
        </div>
      </div>
      {aviso.detalle && <p className="mt-2 text-sm text-amber-900">{aviso.detalle}</p>}
      {sinPiso && <p className="mt-1 text-xs text-ink/50">Pon ese ID en el piso que corresponde (Maestros → Apartamentos) y pulsa Reintentar.</p>}
      {mensaje && <p className="mt-2 text-sm text-clay">{mensaje}</p>}
    </li>
  );
}

function TarjetaFirma({ aviso, onHecho }: { aviso: Aviso; onHecho: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const descartar = useDescartar(aviso, onHecho, setMensaje, setOcupado);
  const d = aviso.datos ?? {};
  const firmante = d.firmante ?? aviso.asunto ?? "Firma";
  // Búsqueda inicial: el apellido del firmante (última palabra).
  const [texto, setTexto] = useState(() => (d.firmante ?? "").trim().split(/\s+/).pop() ?? "");
  const [asignando, setAsignando] = useState(false);
  const [candidatas, setCandidatas] = useState<Candidata[] | null>(null);

  useEffect(() => {
    if (!asignando) return;
    const t = setTimeout(async () => {
      let q = supabase
        .from("reservas")
        .select("id, fecha_entrada, fecha_salida, nombre, apellido1, contrato_firmado_at, apartamentos(piso, clientes(codigo, nombre))")
        .neq("estado", "cancelada")
        .order("fecha_entrada", { ascending: false })
        .limit(40);
      const b = texto.trim().replace(/[%,()]/g, " ");
      if (b) q = q.or(`nombre.ilike.%${b}%,apellido1.ilike.%${b}%,codigo_reserva.ilike.%${b}%`);
      else if (aviso.recibido_at) {
        // Sin texto: entradas que estaban en curso o por llegar cuando se firmó.
        q = q.gte("fecha_salida", aviso.recibido_at.slice(0, 10));
      }
      const { data } = await q;
      setCandidatas((data as unknown as Candidata[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [supabase, texto, asignando, aviso.recibido_at]);

  async function asignar(c: Candidata) {
    const nombre = [c.nombre, c.apellido1].filter(Boolean).join(" ");
    const aviso2 = c.contrato_firmado_at ? "\n\nOjo: esa entrada ya tiene el contrato marcado como firmado." : "";
    if (!window.confirm(`¿Asignar el contrato firmado por ${firmante} a la entrada de ${nombre} (${c.apartamentos?.piso ?? "—"}, ${fecha(c.fecha_entrada)})?${aviso2}`))
      return;
    setOcupado(true);
    setMensaje("");
    const { error } = await supabase.rpc("asignar_firma", { p_aviso: aviso.id, p_reserva: c.id });
    setOcupado(false);
    if (error) return setMensaje(error.message);
    onHecho();
  }

  return (
    <li className="rounded-lg border border-line">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium">{firmante}</p>
          <p className="text-xs text-ink/60">
            {d.titulo ?? "Contrato"}
            {d.email ? ` · ${d.email}` : ""} · firmado el {fecha(aviso.recibido_at)}
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <button type="button" disabled={ocupado} onClick={() => setAsignando((v) => !v)} className="text-xs font-medium underline disabled:opacity-50">
            {asignando ? "Cerrar" : "Asignar a entrada"}
          </button>
          <button type="button" disabled={ocupado} onClick={descartar} className="text-xs text-clay underline disabled:opacity-50">
            Descartar
          </button>
        </div>
      </div>
      {aviso.detalle && <p className="px-4 pb-2 text-sm text-amber-900">{aviso.detalle}</p>}
      {asignando && (
        <div className="border-t border-line px-4 py-3">
          <input type="search" placeholder="Buscar entrada por titular o código…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <ul className="mt-2 max-h-60 divide-y divide-line overflow-y-auto rounded-md border border-line">
            {candidatas === null ? (
              <li className="px-3 py-2 text-sm text-ink/40">Buscando…</li>
            ) : candidatas.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink/40">No hay entradas.</li>
            ) : (
              candidatas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => asignar(c)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-paper disabled:opacity-50"
                  >
                    <span className="font-medium">{[c.nombre, c.apellido1].filter(Boolean).join(" ")}</span>
                    <span className="block text-xs text-ink/50">
                      {c.apartamentos?.clientes?.codigo ?? c.apartamentos?.clientes?.nombre ?? "—"} · {c.apartamentos?.piso ?? "—"} ·{" "}
                      {fecha(c.fecha_entrada)} → {fecha(c.fecha_salida)}
                      {c.contrato_firmado_at ? " · ya firmado" : ""}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
      {mensaje && <p className="px-4 pb-3 text-sm text-clay">{mensaje}</p>}
    </li>
  );
}
