"use client";

// Registros del formulario de enlace único (/registro) que no se han podido vincular solos a una entrada:
// se asignan a mano a la entrada que corresponde (o se descartan).

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type HuespedRegistro = {
  nombre: string;
  apellido1: string;
  apellido2?: string;
  numero_documento?: string;
  fecha_nacimiento?: string;
  nacionalidad_codigo?: string;
  correo?: string;
  telefono?: string;
};
type Registro = {
  id: string;
  fecha_entrada: string;
  fecha_salida: string | null;
  num_huespedes: number;
  huespedes: HuespedRegistro[];
  created_at: string;
};
type Candidata = {
  id: string;
  fecha_entrada: string;
  fecha_salida: string;
  nombre: string;
  apellido1: string | null;
  num_huespedes: number | null;
  apartamentos: { piso: string; clientes: { codigo: string | null; nombre: string } | null } | null;
  huespedes: { id: string }[];
};

const fecha = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const sumarDias = (iso: string, d: number) => {
  const x = new Date(iso + "T12:00:00");
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};
const nombreDe = (h: { nombre: string; apellido1?: string | null; apellido2?: string | null }) =>
  [h.nombre, h.apellido1, h.apellido2].filter(Boolean).join(" ");

export default function RegistrosPendientes({ onCambio }: { onCambio: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("registros_huespedes")
      .select("id, fecha_entrada, fecha_salida, num_huespedes, huespedes, created_at")
      .eq("estado", "pendiente")
      .order("fecha_entrada");
    setRegistros((data as Registro[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!registros.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
      >
        {registros.length === 1 ? "1 registro de huéspedes sin asignar" : `${registros.length} registros de huéspedes sin asignar`}
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:px-4" onClick={() => setAbierto(false)}>
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Registros sin asignar</h2>
                <p className="mt-1 text-sm text-ink/60">
                  Enviados desde el enlace único del formulario sin coincidencia con el titular de ninguna entrada. Asígnalos a
                  la entrada que corresponde: sus huéspedes pasan a ella (después marca el titular si hace falta).
                </p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} className="text-sm text-ink/50 hover:text-ink">
                Cerrar
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {registros.map((r) => (
                <TarjetaRegistro
                  key={r.id}
                  registro={r}
                  onHecho={() => {
                    cargar();
                    onCambio();
                    window.dispatchEvent(new Event("pendientes-cambiados"));
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TarjetaRegistro({ registro, onHecho }: { registro: Registro; onHecho: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [candidatas, setCandidatas] = useState<Candidata[] | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      let q = supabase
        .from("reservas")
        .select("id, fecha_entrada, fecha_salida, nombre, apellido1, num_huespedes, apartamentos(piso, clientes(codigo, nombre)), huespedes!huespedes_reserva_id_fkey(id)")
        .neq("estado", "cancelada")
        .order("fecha_entrada")
        .limit(40);
      const b = texto.trim().replace(/[%,()]/g, " ");
      if (b) q = q.or(`nombre.ilike.%${b}%,apellido1.ilike.%${b}%,codigo_reserva.ilike.%${b}%`);
      else q = q.gte("fecha_entrada", sumarDias(registro.fecha_entrada, -3)).lte("fecha_entrada", sumarDias(registro.fecha_entrada, 3));
      const { data } = await q;
      setCandidatas((data as unknown as Candidata[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [supabase, texto, registro.fecha_entrada]);

  async function asignar(c: Candidata) {
    if (
      !window.confirm(
        `¿Asignar los ${registro.num_huespedes} huéspedes de este registro a la entrada de ${nombreDe(c)} (${c.apartamentos?.piso ?? "—"}, ${fecha(c.fecha_entrada)})?`,
      )
    )
      return;
    setOcupado(true);
    setError("");
    const { error: err } = await supabase.rpc("asignar_registro", { p_registro: registro.id, p_reserva: c.id });
    setOcupado(false);
    if (err) return setError(err.message);
    onHecho();
  }

  async function descartar() {
    if (!window.confirm("¿Descartar este registro? Se borran los datos de sus huéspedes (solo quedan los nombres).")) return;
    setOcupado(true);
    const { error: err } = await supabase.rpc("descartar_registro", { p_registro: registro.id });
    setOcupado(false);
    if (err) return setError(err.message);
    onHecho();
  }

  return (
    <div className="rounded-lg border border-line">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line bg-paper px-4 py-3">
        <div>
          <p className="font-medium">{registro.huespedes.map((h) => nombreDe(h)).join(", ")}</p>
          <p className="text-xs text-ink/60">
            {fecha(registro.fecha_entrada)} → {fecha(registro.fecha_salida)} · {registro.num_huespedes} huésp. · enviado el{" "}
            {new Date(registro.created_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
          </p>
        </div>
        <button type="button" disabled={ocupado} onClick={descartar} className="text-xs text-clay underline disabled:opacity-50">
          Descartar
        </button>
      </div>
      <ul className="px-4 py-2 text-sm">
        {registro.huespedes.map((h, i) => (
          <li key={i} className="py-0.5">
            {nombreDe(h)}
            <span className="text-xs text-ink/50">
              {" "}
              {h.numero_documento ? ` · ${h.numero_documento}` : ""}
              {h.fecha_nacimiento ? ` · ${fecha(h.fecha_nacimiento)}` : ""}
              {h.correo ? ` · ${h.correo}` : ""}
              {h.telefono ? ` · ${h.telefono}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t border-line px-4 py-3">
        <p className="mb-2 text-xs font-medium text-ink/60">Asignar a la entrada:</p>
        <input type="search" placeholder="Buscar otra entrada por titular o código…" value={texto} onChange={(e) => setTexto(e.target.value)} />
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
                  <span className="font-medium">{nombreDe(c)}</span>
                  <span className="block text-xs text-ink/50">
                    {c.apartamentos?.clientes?.codigo ?? c.apartamentos?.clientes?.nombre ?? "—"} · {c.apartamentos?.piso ?? "—"} ·{" "}
                    {fecha(c.fecha_entrada)} → {fecha(c.fecha_salida)} · {c.huespedes.length}/{c.num_huespedes ?? "?"} huésp.
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        {!texto.trim() && (
          <p className="mt-1 text-xs text-ink/40">
            Entradas que llegan entre el {fecha(sumarDias(registro.fecha_entrada, -3))} y el {fecha(sumarDias(registro.fecha_entrada, 3))}.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-clay">{error}</p>}
      </div>
    </div>
  );
}
