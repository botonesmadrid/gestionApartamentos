"use client";

// Vista de calendario de Entradas: una fila por piso (agrupados por cliente) y una columna por día; cada entrada es
// una barra de la entrada a la salida con el nombre del titular. Se pueden ocultar clientes y pisos (se recuerda en
// este dispositivo). Cada cliente se pinta con su color, el mismo que sus eventos en Google Calendar.
// Las entradas se envían solas a Google Calendar (al crearlas, modificarlas o cancelarlas, y en una revisión cada
// 10 minutos) cuando tienen piso asignado y titular; cada barra indica si está al día y al pulsarla se puede reenviar.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COLOR_SIN_ASIGNAR, hexCliente } from "@/lib/coloresCalendario";

type Apto = { id: string; piso: string; cliente_id: string | null };
type Cliente = { id: string; nombre: string; codigo: string | null; created_at: string; color_calendario: number | null };
type Entrada = {
  id: string;
  apartamento_id: string;
  nombre: string;
  apellido1: string | null;
  fecha_entrada: string;
  fecha_salida: string;
  num_huespedes: number | null;
  fase: string;
  estado: string;
  codigo_reserva: string | null;
  calendario_evento_id: string | null;
  calendario_sync: { entrada: string; salida: string; nombre: string; apartamento_id: string; num_huespedes: number | null; color?: number | null } | null;
  calendario_sincronizado_at: string | null;
  origenes_reserva: { nombre: string } | null;
};

const ANCHO_DIA = 36; // px
const DIAS = 35;
const CLAVE_OCULTOS = "calendario-ocultos";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sumar = (f: string, n: number) => {
  const d = new Date(f + "T12:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
};
const dias = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 864e5);
const fechaCorta = (f: string) => f.split("-").reverse().join("/");
const titularDe = (e: Entrada) => [e.nombre, e.apellido1].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");

type Sync = "al_dia" | "cambiada" | "sin_enviar" | "no_aplica";
// Igual que en la función calendario: va a Calendar si no está cancelada y tiene piso asignado y titular.
function estadoSync(e: Entrada, piso: string | undefined, color: number | null): Sync {
  const debeEstar = e.estado !== "cancelada" && !!piso && piso !== "SIN ASIGNAR" && !!titularDe(e);
  if (!debeEstar) return e.calendario_evento_id ? "cambiada" : "no_aplica"; // hay que quitarla de Calendar
  if (!e.calendario_evento_id || !e.calendario_sync) return "sin_enviar";
  const s = e.calendario_sync;
  return s.entrada === e.fecha_entrada && s.salida === e.fecha_salida && s.nombre === titularDe(e) &&
    s.apartamento_id === e.apartamento_id && (s.num_huespedes ?? null) === (e.num_huespedes ?? null) &&
    (s.color ?? null) === color
    ? "al_dia"
    : "cambiada";
}
const SYNC: Record<Sync, { icono: string; texto: string; clase: string }> = {
  al_dia: { icono: "✓", texto: "En Google Calendar y al día", clase: "text-emerald-700" },
  cambiada: { icono: "↻", texto: "En Google Calendar, pero ha cambiado desde que se envió", clase: "text-amber-700" },
  sin_enviar: { icono: "○", texto: "Aún no está en Google Calendar", clase: "text-ink/40" },
  no_aplica: { icono: "–", texto: "No va a Google Calendar (cancelada, sin piso asignado o sin titular)", clase: "text-ink/40" },
};

export default function CalendarioEntradas({ apartamentos, clientes }: { apartamentos: Apto[]; clientes: Cliente[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [inicio, setInicio] = useState(() => sumar(iso(new Date()), -3));
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [elegida, setElegida] = useState<Entrada | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const fin = sumar(inicio, DIAS);
  const hoy = iso(new Date());

  useEffect(() => {
    try {
      setOcultos(new Set(JSON.parse(localStorage.getItem(CLAVE_OCULTOS) ?? "[]")));
    } catch {}
  }, []);
  // Se guardan los pisos ocultos; el check de un cliente muestra u oculta todos sus pisos a la vez.
  const fijar = (ids: string[], ocultar: boolean) =>
    setOcultos((prev) => {
      const n = new Set(prev);
      for (const id of ids) {
        if (ocultar) n.add(id);
        else n.delete(id);
      }
      try {
        localStorage.setItem(CLAVE_OCULTOS, JSON.stringify([...n]));
      } catch {}
      return n;
    });

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from("reservas")
      .select(`id, apartamento_id, nombre, apellido1, fecha_entrada, fecha_salida, num_huespedes, fase, estado, codigo_reserva,
        calendario_evento_id, calendario_sync, calendario_sincronizado_at, origenes_reserva(nombre)`)
      // Las canceladas solo si siguen en Google Calendar (para poder quitarlas).
      .or("estado.neq.cancelada,calendario_evento_id.not.is.null")
      .lt("fecha_entrada", fin)
      .gt("fecha_salida", inicio)
      .order("fecha_entrada");
    setEntradas((data as unknown as Entrada[]) ?? []);
    setCargando(false);
  }, [supabase, inicio, fin]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  // Clientes (con su color de Google Calendar) y sus pisos; "SIN ASIGNAR" al final de su cliente. Arriba CM y debajo
  // Barco; el resto después, por fecha de alta.
  const grupos = useMemo(() => {
    const porAlta = [...clientes].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const prioridad = (c: Cliente) =>
      c.codigo?.toUpperCase() === "CM" ? 0 : /barco/i.test(`${c.codigo ?? ""} ${c.nombre}`) ? 1 : 2;
    return porAlta
      .map((c) => ({
        cliente: c,
        color: hexCliente(c.color_calendario),
        pisos: apartamentos
          .filter((a) => a.cliente_id === c.id)
          .sort((a, b) => (a.piso === "SIN ASIGNAR" ? 1 : b.piso === "SIN ASIGNAR" ? -1 : a.piso.localeCompare(b.piso, "es"))),
      }))
      .sort((a, b) => prioridad(a.cliente) - prioridad(b.cliente))
      .filter((g) => g.pisos.length);
  }, [clientes, apartamentos]);
  const porPiso = useMemo(() => {
    const m = new Map<string, Entrada[]>();
    for (const e of entradas) m.set(e.apartamento_id, [...(m.get(e.apartamento_id) ?? []), e]);
    return m;
  }, [entradas]);

  const totalPisos = grupos.reduce((n, g) => n + g.pisos.length, 0);
  const pisosVisibles = grupos.reduce((n, g) => n + g.pisos.filter((p) => !ocultos.has(p.id)).length, 0);
  // En móvil el panel de filtros empieza plegado.
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setPanelAbierto(false);
  }, []);

  const diasVista = Array.from({ length: DIAS }, (_, i) => sumar(inicio, i));

  async function enviar(e: Entrada) {
    setEnviando(true);
    setMensaje(null);
    const { data, error } = await supabase.functions.invoke("calendario", { body: { reserva_id: e.id } });
    setEnviando(false);
    let r = data as any;
    if (error) {
      try {
        r = await (error as any).context?.json();
      } catch {}
    }
    if (r?.ok) {
      setMensaje({ ok: true, texto: r.quitado ? "Quitada de Google Calendar." : "Enviada a Google Calendar." });
      await cargar();
      setElegida(null);
      return;
    }
    const textos: Record<string, string> = {
      sin_permiso: "La conexión con Google aún no tiene permiso de Calendar: hay que renovarla (ver instrucciones).",
      api_desactivada: "La API de Google Calendar no está activada en el proyecto de Google Cloud.",
    };
    setMensaje({ ok: false, texto: textos[r?.error] ?? `No se ha podido enviar${r?.detalle ? `: ${r.detalle}` : "."}` });
  }

  const colorDe = (aptoId: string) => {
    const g = grupos.find((x) => x.pisos.some((p) => p.id === aptoId));
    return g?.color ?? COLOR_SIN_ASIGNAR;
  };
  // Estado de la sincronización de una entrada (con el piso y el color de su cliente).
  const syncDe = (e: Entrada) => {
    const g = grupos.find((x) => x.pisos.some((p) => p.id === e.apartamento_id));
    return estadoSync(e, g?.pisos.find((p) => p.id === e.apartamento_id)?.piso, g?.cliente.color_calendario ?? null);
  };
  const resumen = useMemo(() => {
    const visibles = entradas.filter((e) => {
      const g = grupos.find((x) => x.pisos.some((p) => p.id === e.apartamento_id));
      return g && !ocultos.has(e.apartamento_id);
    });
    return {
      total: visibles.length,
      sinEnviar: visibles.filter((e) => syncDe(e) === "sin_enviar").length,
      cambiadas: visibles.filter((e) => syncDe(e) === "cambiada").length,
      alDia: visibles.filter((e) => syncDe(e) === "al_dia").length,
    };
  }, [entradas, grupos, ocultos]);

  return (
    <div>
      {/* Navegación y filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" onClick={() => setInicio(sumar(inicio, -7))} className="rounded-md border border-line px-2.5 py-1.5 hover:bg-paper">
            ← <span className="hidden sm:inline">Semana</span>
          </button>
          <button type="button" onClick={() => setInicio(sumar(hoy, -3))} className="rounded-md border border-line px-2.5 py-1.5 hover:bg-paper">
            Hoy
          </button>
          <button type="button" onClick={() => setInicio(sumar(inicio, 7))} className="rounded-md border border-line px-2.5 py-1.5 hover:bg-paper">
            <span className="hidden sm:inline">Semana</span> →
          </button>
          <input type="date" aria-label="Desde" className="!w-auto !py-1.5" value={inicio} onChange={(e) => e.target.value && setInicio(e.target.value)} />
        </div>
        <p className="text-xs text-ink/50">
          {resumen.total} entradas · <span className="text-emerald-700">✓ {resumen.alDia} al día</span> · <span className="text-amber-700">↻ {resumen.cambiadas} cambiadas</span> ·{" "}
          <span>○ {resumen.sinEnviar} sin enviar</span> a Google Calendar
        </p>
      </div>

      <div className="mt-3 lg:flex lg:items-start lg:gap-4">
        {/* Filtros: en el lateral (en móvil, desplegable) */}
        <details className="mb-3 rounded-lg border border-line bg-white lg:sticky lg:top-4 lg:mb-0 lg:w-52 lg:shrink-0" open={panelAbierto} onToggle={(e) => setPanelAbierto((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium lg:cursor-default">
            Pisos visibles <span className="font-normal text-ink/50">({pisosVisibles}/{totalPisos})</span>
          </summary>
          <div className="space-y-3 border-t border-line px-3 py-3">
            {grupos.map((g) => {
              const visibles = g.pisos.filter((p) => !ocultos.has(p.id)).length;
              const todos = visibles === g.pisos.length;
              return (
                <div key={g.cliente.id}>
                  <label className="!mb-0 flex items-center gap-2 !text-sm !font-medium !text-ink">
                    <input
                      type="checkbox"
                      className="!w-auto"
                      checked={visibles > 0}
                      ref={(el) => {
                        if (el) el.indeterminate = visibles > 0 && !todos;
                      }}
                      onChange={() => fijar(g.pisos.map((p) => p.id), todos)}
                    />
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                    <span className="truncate">{g.cliente.nombre}</span>
                  </label>
                  {g.pisos.length > 1 && (
                    <div className="ml-6 mt-1 space-y-0.5">
                      {g.pisos.map((p) => (
                        <label key={p.id} className="!mb-0 flex items-center gap-2 !text-xs !font-normal !text-ink/70">
                          <input type="checkbox" className="!w-auto" checked={!ocultos.has(p.id)} onChange={() => fijar([p.id], !ocultos.has(p.id))} />
                          {p.piso}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>

      {/* Calendario */}
      <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-white">
        <div style={{ width: 150 + DIAS * ANCHO_DIA }}>
          <div className="sticky top-0 z-10 flex border-b border-line bg-white">
            <div className="sticky left-0 z-20 w-[150px] shrink-0 border-r border-line bg-white px-2 py-1.5 text-xs text-ink/50">
              {cargando ? "Cargando…" : "Piso"}
            </div>
            {diasVista.map((d) => {
              const dt = new Date(d + "T12:00:00");
              const finde = dt.getDay() === 0 || dt.getDay() === 6;
              return (
                <div
                  key={d}
                  style={{ width: ANCHO_DIA }}
                  className={`shrink-0 border-r border-line/60 py-1 text-center text-[10px] leading-tight ${d === hoy ? "bg-clay/10 font-semibold text-clay" : finde ? "bg-paper text-ink/60" : "text-ink/60"}`}
                >
                  <div>{dt.toLocaleDateString("es-ES", { weekday: "narrow" })}</div>
                  <div className="text-xs">{dt.getDate()}</div>
                  {dt.getDate() === 1 || d === inicio ? <div className="text-[9px] uppercase">{dt.toLocaleDateString("es-ES", { month: "short" })}</div> : <div>&nbsp;</div>}
                </div>
              );
            })}
          </div>

          {grupos
            .filter((g) => g.pisos.some((p) => !ocultos.has(p.id)))
            .map((g) => (
              <div key={g.cliente.id}>
                <div className="sticky left-0 flex border-b border-line bg-paper/70">
                  <div className="sticky left-0 w-[150px] shrink-0 px-2 py-1 text-xs font-semibold" style={{ color: g.color }}>
                    {g.cliente.nombre}
                  </div>
                </div>
                {g.pisos
                  .filter((p) => !ocultos.has(p.id))
                  .map((p) => (
                    <div key={p.id} className="relative flex h-10 border-b border-line/60">
                      <div className="sticky left-0 z-10 flex w-[150px] shrink-0 items-center gap-1.5 border-r border-line bg-white px-2 text-sm">
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
                        <span className="truncate">
                          <span className="text-xs font-semibold text-ink/50">{g.cliente.codigo}</span> {p.piso}
                        </span>
                      </div>
                      {diasVista.map((d) => (
                        <div key={d} style={{ width: ANCHO_DIA }} className={`shrink-0 border-r border-line/40 ${d === hoy ? "bg-clay/5" : ""}`} />
                      ))}
                      {(porPiso.get(p.id) ?? []).map((e) => {
                        // La barra va de la tarde del día de entrada a la mañana del de salida.
                        const desde = Math.max(dias(inicio, e.fecha_entrada) + 0.5, 0);
                        const hasta = Math.min(dias(inicio, e.fecha_salida) + 0.5, DIAS);
                        if (hasta <= 0 || desde >= DIAS) return null;
                        const s = SYNC[syncDe(e)];
                        const cancelada = e.estado === "cancelada";
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => {
                              setElegida(e);
                              setMensaje(null);
                            }}
                            title={`${titularDe(e)} · ${fechaCorta(e.fecha_entrada)} → ${fechaCorta(e.fecha_salida)} · ${s.texto}`}
                            className={`absolute top-1.5 flex h-7 items-center gap-1 overflow-hidden rounded-md px-1.5 text-left text-xs font-medium shadow-sm ring-1 ring-black/10 hover:brightness-110 ${cancelada ? "text-ink/60 line-through" : "text-white"}`}
                            style={{ left: 150 + desde * ANCHO_DIA + 1, width: Math.max((hasta - desde) * ANCHO_DIA - 2, 8), background: cancelada ? "#e5e7eb" : g.color }}
                          >
                            <span className="shrink-0 rounded-full bg-white/90 px-1 text-[10px] leading-4" title={s.texto}>
                              <span className={s.clase}>{s.icono}</span>
                            </span>
                            <span className="truncate">{titularDe(e)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
              </div>
            ))}
        </div>
      </div>
      </div>

      {mensaje && !elegida && (
        <p className={`mt-2 text-sm ${mensaje.ok ? "text-emerald-700" : "text-clay"}`}>{mensaje.texto}</p>
      )}

      {/* Detalle de la entrada elegida */}
      {elegida && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:px-4" onClick={() => setElegida(null)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-lg" onClick={(ev) => ev.stopPropagation()}>
            {(() => {
              const g = grupos.find((x) => x.pisos.some((p) => p.id === elegida.apartamento_id));
              const piso = g?.pisos.find((p) => p.id === elegida.apartamento_id)?.piso;
              const sync = syncDe(elegida);
              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold" style={{ color: colorDe(elegida.apartamento_id) }}>
                        {g?.cliente.nombre} · {piso}
                      </p>
                      <h3 className="font-display text-xl font-semibold">
                        {titularDe(elegida)}
                        {elegida.estado === "cancelada" && <span className="ml-2 align-middle text-xs font-medium text-clay">Cancelada</span>}
                      </h3>
                    </div>
                    <button type="button" onClick={() => setElegida(null)} className="text-sm text-ink/50 hover:text-ink">
                      Cerrar
                    </button>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-ink/50">Estancia</dt><dd>{fechaCorta(elegida.fecha_entrada)} → {fechaCorta(elegida.fecha_salida)} ({dias(elegida.fecha_entrada, elegida.fecha_salida)} noches)</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-ink/50">Huéspedes</dt><dd>{elegida.num_huespedes ?? "—"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-ink/50">Origen</dt><dd>{elegida.origenes_reserva?.nombre ?? "—"}{elegida.codigo_reserva ? ` · ${elegida.codigo_reserva}` : ""}</dd></div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink/50">Google Calendar</dt>
                      <dd className={SYNC[sync].clase}>
                        {SYNC[sync].icono} {SYNC[sync].texto}
                        {elegida.calendario_sincronizado_at && (
                          <span className="block text-right text-xs text-ink/40">
                            Enviada el {new Date(elegida.calendario_sincronizado_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  {mensaje && <p className={`mt-3 text-sm ${mensaje.ok ? "text-emerald-700" : "text-clay"}`}>{mensaje.texto}</p>}
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      disabled={enviando || sync === "al_dia" || sync === "no_aplica"}
                      onClick={() => enviar(elegida)}
                      className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-40"
                    >
                      {enviando
                        ? "Enviando…"
                        : sync === "no_aplica"
                          ? "No va a Google Calendar"
                          : sync === "sin_enviar"
                            ? "Enviar a Google Calendar"
                            : sync === "cambiada"
                              ? elegida.estado === "cancelada" || !piso || piso === "SIN ASIGNAR" || !titularDe(elegida) ? "Quitar de Google Calendar" : "Actualizar en Google Calendar"
                              : "Al día en Google Calendar"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
