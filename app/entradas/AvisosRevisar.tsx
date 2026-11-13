"use client";

// Correos de los channel managers (Avirato, Little Hotelier) y de firmas que no se han podido aplicar solos
// (avisos_canal.resultado = 'revisar'): se reintentan después de corregir el motivo o se descartan.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Aviso = {
  id: string;
  canal: string;
  recibido_at: string | null;
  asunto: string | null;
  detalle: string | null;
  datos: { tipo?: string; cliente?: string; entrada?: string; salida?: string; codigo?: string } | null;
};

const CANALES: Record<string, string> = { avirato: "Avirato", littlehotelier: "Little Hotelier", hellosign: "Firma de contrato" };
const TIPOS: Record<string, string> = { alta: "Reserva nueva", modificacion: "Modificación", cancelacion: "Cancelación" };
const REINTENTABLES = new Set(["avirato", "littlehotelier"]);
const fecha = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export default function AvisosRevisar({ onCambio }: { onCambio: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("avisos_canal")
      .select("id, canal, recibido_at, asunto, detalle, datos")
      .eq("resultado", "revisar")
      .is("descartado_at", null)
      .order("recibido_at");
    setAvisos((data as Aviso[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (abierto && !avisos.length) setAbierto(false);
  }, [abierto, avisos.length]);

  if (!avisos.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
      >
        {avisos.length === 1 ? "1 correo sin aplicar" : `${avisos.length} correos sin aplicar`}
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:px-4" onClick={() => setAbierto(false)}>
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Correos sin aplicar</h2>
                <p className="mt-1 text-sm text-ink/60">
                  Avisos de reservas que no se han podido meter solos en Entradas. Corrige el motivo (p. ej. el ID de la
                  habitación en{" "}
                  <Link href="/admin/maestros/apartamentos" className="underline">
                    Maestros
                  </Link>
                  ) y pulsa Reintentar, o descártalo si no hay nada que hacer.
                </p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} className="text-sm text-ink/50 hover:text-ink">
                Cerrar
              </button>
            </div>
            <ul className="mt-4 space-y-3">
              {avisos.map((a) => (
                <TarjetaAviso
                  key={a.id}
                  aviso={a}
                  onHecho={() => {
                    cargar();
                    onCambio();
                  }}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function TarjetaAviso({ aviso, onHecho }: { aviso: Aviso; onHecho: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
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

  async function descartar() {
    if (!window.confirm("¿Descartar este aviso? No cambia ninguna entrada; solo deja de salir en esta lista.")) return;
    setOcupado(true);
    const { error } = await supabase.from("avisos_canal").update({ descartado_at: new Date().toISOString() }).eq("id", aviso.id);
    setOcupado(false);
    if (error) return setMensaje(error.message);
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
          {REINTENTABLES.has(aviso.canal) && (
            <button type="button" disabled={ocupado} onClick={reintentar} className="text-xs font-medium underline disabled:opacity-50">
              Reintentar
            </button>
          )}
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
