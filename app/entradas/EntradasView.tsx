"use client";

import { COLOR_SIN_ASIGNAR, hexCliente } from "@/lib/coloresCalendario";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EditarHuesped, EditarReserva, HUESPED_NUEVO } from "./Edicion";
import { AccionesEntrada, CopiarTitular, EliminarHuesped, MoverHuesped } from "./Combinar";
import RegistrosPendientes from "./RegistrosPendientes";
import AvisosRevisar from "./AvisosRevisar";
import { ACCIONES, filtrarAccion, type Accion } from "@/lib/acciones";

type Apartamento = { id: string; piso: string };
type Cliente = { id: string; nombre: string; codigo: string | null; created_at: string; color_calendario: number | null };

// Color de cada cliente: el mismo que en Google Calendar (clientes.color_calendario).
const SIN_CLIENTE = COLOR_SIN_ASIGNAR;
type Origen = { codigo: string; nombre: string };

// Valor especial del filtro de origen para las reservas sin origen informado.
const SIN_ORIGEN = "__sin_origen__";

type Huesped = {
  id: string;
  created_at: string;
  nombre: string;
  apellido1: string | null;
  apellido2: string | null;
  telefono: string | null;
  correo: string | null;
  fecha_nacimiento: string | null;
  soporte_documento: string | null;
  numero_documento: string | null;
  direccion: string | null;
  codigo_postal: string | null;
  nombre_municipio: string | null;
  tipo_documento_codigo: string | null;
  rol: string | null;
  sexo_codigo: string | null;
  parentesco_codigo: string | null;
  nacionalidad_codigo: string | null;
  pais_codigo: string | null;
  codigo_municipio_ref: string | null;
  motivo_viaje: string | null;
  es_huesped: boolean;
  nacionalidad: { nombre: string } | null;
  tipos_documento: { descripcion: string } | null;
  sexos: { descripcion: string } | null;
  parentescos: { descripcion: string } | null;
};

type Reserva = {
  id: string;
  apartamento_id: string;
  piso_pendiente: boolean;
  fecha_reserva: string | null;
  fecha_entrada: string;
  fecha_salida: string;
  nombre: string;
  apellido1: string | null;
  apellido2: string | null;
  importe: number | null;
  comision_portal: number | null;
  codigo_reserva: string | null;
  telefono: string | null;
  fecha_pago: string | null;
  duracion: number | null;
  estado: "confirmada" | "cancelada";
  cancelada_at: string | null;
  fase: Fase;
  formulario_enviado_at: string | null;
  formulario_completado_at: string | null;
  contrato_enviado_at: string | null;
  contrato_firmado_at: string | null;
  checkin_at: string | null;
  num_huespedes: number | null;
  formulario_token: string;
  titular_huesped_id: string | null;
  contrato_generado_at: string | null;
  contrato_pdf_id: string | null;
  contrato_titular_huesped_id: string | null;
  ses_xml_id: string | null;
  ses_generado_at: string | null;
  ses_comunicado_at: string | null;
  contrato_carpeta_id: string | null;
  contrato_firmado_pdf_id: string | null;
  canal: string | null;
  importe_neto: number | null;
  importe_pendiente: boolean;
  origen_codigo: string | null;
  forma_pago_codigo: string | null;
  apartamentos: { piso: string; cliente_id: string | null } | null;
  origenes_reserva: { nombre: string } | null;
  formas_pago: { descripcion: string } | null;
  huespedes: Huesped[] | null;
};

type Rango = "ultimos31" | "mas7" | "semana" | "mes" | "anio" | "personalizado";

// Fases del flujo de una reserva (columna calculada reservas.fase).
type Fase =
  | "pendiente_importe"
  | "pendiente_documentacion"
  | "pendiente_ses"
  | "lista_checkin"
  | "checkin_completado"
  | "cancelada";

const FASES: { valor: Fase; etiqueta: string; clase: string }[] = [
  { valor: "pendiente_importe", etiqueta: "Información obligatoria", clase: "bg-amber-100 text-amber-900" },
  { valor: "pendiente_documentacion", etiqueta: "Pendiente de documentación", clase: "bg-sky-100 text-sky-900" },
  { valor: "pendiente_ses", etiqueta: "Pendiente SES Hospedajes", clase: "bg-violet-100 text-violet-900" },
  { valor: "lista_checkin", etiqueta: "Lista para check-in", clase: "bg-emerald-100 text-emerald-900" },
  { valor: "checkin_completado", etiqueta: "Check-in completado", clase: "bg-ink/10 text-ink/70" },
  { valor: "cancelada", etiqueta: "Cancelada", clase: "bg-clay/10 text-clay" },
];
const FASE = Object.fromEntries(FASES.map((f) => [f.valor, f])) as Record<Fase, (typeof FASES)[number]>;

// Filtro de estado: las fases + "activas" (todo menos canceladas) + "todas".
type FiltroEstado = Fase | "activas" | "todas";
// Fases que son tareas por hacer: se muestran sin limitar por fechas.
const FASES_TAREA: FiltroEstado[] = ["pendiente_importe", "pendiente_documentacion", "pendiente_ses", "lista_checkin"];

// Fechas en hora local (no UTC: en España toISOString() puede dar el día anterior).
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hoyISO() {
  return iso(new Date());
}

function sumarDias(fechaISO: string, dias: number) {
  const d = new Date(fechaISO + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return iso(d);
}

// Rangos de fecha de entrada predefinidos. "Últimos 31 días" no tiene fin: incluye todas las entradas futuras.
function rangoDe(r: Exclude<Rango, "personalizado">): { desde: string; hasta: string } {
  const h = new Date();
  if (r === "ultimos31") return { desde: sumarDias(hoyISO(), -31), hasta: "" };
  if (r === "mas7") return { desde: sumarDias(hoyISO(), -7), hasta: sumarDias(hoyISO(), 7) };
  if (r === "semana") {
    const lunes = sumarDias(hoyISO(), -((h.getDay() + 6) % 7));
    return { desde: lunes, hasta: sumarDias(lunes, 6) };
  }
  if (r === "mes") return { desde: iso(new Date(h.getFullYear(), h.getMonth(), 1)), hasta: iso(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
  return { desde: `${h.getFullYear()}-01-01`, hasta: `${h.getFullYear()}-12-31` };
}

function euros(n: number) {
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

// Burbuja de acción pendiente: falta el importe con comisión del portal.
// Con `cambiar`, en vez de la burbuja muestra un enlace "Cambiar" para corregir un importe ya puesto.
// Piso pendiente: la entrada está en "SIN ASIGNAR". Se elige uno de los pisos del mismo cliente; se avisa si ya hay
// otra entrada en ese piso en las mismas fechas.
function PisoPendiente({ reserva, onGuardado }: { reserva: Reserva; onGuardado: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [abierto, setAbierto] = useState(false);
  const [pisos, setPisos] = useState<{ id: string; piso: string }[]>([]);
  const [elegido, setElegido] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!abierto) return;
    const cliente = reserva.apartamentos?.cliente_id;
    let q = supabase.from("apartamentos").select("id, piso").neq("piso", "SIN ASIGNAR").order("piso");
    if (cliente) q = q.eq("cliente_id", cliente);
    q.then(({ data }) => setPisos((data as { id: string; piso: string }[]) ?? []));
  }, [abierto, reserva.apartamentos?.cliente_id, supabase]);

  useEffect(() => {
    setOcupado(null);
    if (!elegido) return;
    supabase
      .from("reservas")
      .select("nombre, apellido1, fecha_entrada, fecha_salida")
      .eq("apartamento_id", elegido)
      .neq("estado", "cancelada")
      .neq("id", reserva.id)
      .lt("fecha_entrada", reserva.fecha_salida)
      .gt("fecha_salida", reserva.fecha_entrada)
      .limit(1)
      .then(({ data }) => {
        const o = data?.[0];
        setOcupado(o ? `${o.nombre} ${o.apellido1 ?? ""} (${formatoFecha(o.fecha_entrada)} → ${formatoFecha(o.fecha_salida)})` : null);
      });
  }, [elegido, reserva.id, reserva.fecha_entrada, reserva.fecha_salida, supabase]);

  async function guardar() {
    if (!elegido) return;
    if (ocupado && !window.confirm(`Ese piso ya tiene una entrada en esas fechas: ${ocupado}. ¿Asignarlo igualmente?`)) return;
    setGuardando(true);
    setError("");
    const { error: err } = await supabase.from("reservas").update({ apartamento_id: elegido }).eq("id", reserva.id);
    setGuardando(false);
    if (err) return setError(err.message);
    window.dispatchEvent(new Event("pendientes-cambiados"));
    setAbierto(false);
    onGuardado();
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
        title="La entrada está en SIN ASIGNAR: elige el piso"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Falta piso
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Piso" className="!w-36" value={elegido} onChange={(e) => setElegido(e.target.value)} autoFocus>
        <option value="">Elige piso…</option>
        {pisos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.piso}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!elegido || guardando}
        onClick={guardar}
        className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-40"
      >
        {guardando ? "Guardando…" : "Guardar"}
      </button>
      <button type="button" onClick={() => setAbierto(false)} className="text-xs text-ink/50 hover:text-ink">
        Cancelar
      </button>
      {ocupado && <span className="text-xs text-clay">Ocupado: {ocupado}</span>}
      {error && <span className="text-xs text-clay">{error}</span>}
    </div>
  );
}

// Importe pendiente de una reserva de portal. Según cómo llega el precio de Avirato:
//  * Booking: llega CON comisión (importe) → se pide la comisión y el neto se calcula (importe − comisión).
//  * Airbnb y demás: llega SIN comisión (neto) → se pide el importe con comisión y la comisión se calcula.
function ImportePendiente({
  reserva,
  onGuardado,
  cambiar,
}: {
  reserva: Reserva;
  onGuardado: () => void;
  cambiar?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  // Se pide la comisión cuando se conoce el importe con comisión y no el neto (Booking).
  const pideComision = reserva.importe != null && reserva.importe_neto == null;
  const inicial = cambiar
    ? pideComision
      ? reserva.comision_portal != null ? String(reserva.comision_portal) : ""
      : reserva.importe != null ? String(reserva.importe) : ""
    : "";
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const num = valor === "" ? null : Number(valor.replace(",", "."));
  const total = pideComision ? reserva.importe : num;
  const neto = pideComision ? (num != null && total != null ? total - num : null) : reserva.importe_neto;
  const comision = pideComision ? num : total != null && neto != null ? total - neto : null;
  const pct = comision != null && total ? (comision / total) * 100 : null;
  const valido = pideComision
    ? num != null && Number.isFinite(num) && num >= 0 && total != null && num < total
    : num != null && Number.isFinite(num) && num > 0 && (neto == null || num >= neto);

  async function guardar() {
    if (!valido) return;
    setGuardando(true);
    setError("");
    const cambios = pideComision
      ? { importe_neto: Math.round((total! - num!) * 100) / 100, comision_portal: num, importe_pendiente: false }
      : { importe: num, importe_pendiente: false };
    const { error: err } = await supabase.from("reservas").update(cambios).eq("id", reserva.id);
    setGuardando(false);
    if (err) {
      setError(err.message);
      return;
    }
    window.dispatchEvent(new Event("pendientes-cambiados"));
    setAbierto(false);
    onGuardado();
  }

  if (!abierto && cambiar) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="text-xs text-ink/50 underline hover:text-ink">
        {pideComision ? "Cambiar comisión" : "Cambiar"}
      </button>
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
        title={pideComision ? "Introducir la comisión del portal (el importe ya incluye la comisión)" : "Introducir el importe total con la comisión del portal"}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {pideComision ? "Falta comisión" : "Falta importe con comisión"}
        {pideComision
          ? <span className="font-normal text-amber-800/80">· importe {euros(reserva.importe!)}</span>
          : neto != null && <span className="font-normal text-amber-800/80">· neto {euros(neto)}</span>}
      </button>
    );
  }

  const etiqueta = pideComision ? "Comisión del portal" : "Importe con comisión";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        inputMode="decimal"
        autoFocus
        aria-label={etiqueta}
        placeholder={etiqueta}
        className="!w-36"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") guardar();
          if (e.key === "Escape") setAbierto(false);
        }}
      />
      <button
        type="button"
        disabled={!valido || guardando}
        onClick={guardar}
        className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-40"
      >
        {guardando ? "Guardando…" : "Guardar"}
      </button>
      <button type="button" onClick={() => setAbierto(false)} className="text-xs text-ink/50 hover:text-ink">
        Cancelar
      </button>
      {valido && pct != null && (
        <span className={`text-xs ${pct < 10 || pct > 30 ? "text-clay" : "text-ink/50"}`}>
          {pideComision ? `Neto ${euros(neto!)} · ` : `Comisión ${euros(comision!)} · `}
          {pct.toFixed(1)} %{pct < 10 || pct > 30 ? " · revisa el importe" : ""}
        </span>
      )}
      {!pideComision && num != null && neto != null && num < neto && (
        <span className="text-xs text-clay">No puede ser menor que el neto ({euros(neto)}).</span>
      )}
      {pideComision && num != null && total != null && num >= total && (
        <span className="text-xs text-clay">La comisión tiene que ser menor que el importe ({euros(total)}).</span>
      )}
      {error && <span className="text-xs text-clay">{error}</span>}
    </div>
  );
}

// Titular de la reserva (quien firma el contrato): el marcado en la app; si no, el huésped
// cuyo nombre coincide con el de la reserva (el que trae el aviso del canal); si no, el primero.
const normalizar = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
function titularDe(r: Reserva): Huesped | undefined {
  const hs = [...(r.huespedes ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const marcado = hs.find((h) => h.id === r.titular_huesped_id);
  if (marcado) return marcado;
  const nombreReserva = normalizar([r.nombre, r.apellido1].filter(Boolean).join(" "));
  const porNombre = hs.find((h) => {
    const n = normalizar(h.nombre);
    const a = normalizar(h.apellido1);
    return n && nombreReserva.includes(n) && (!a || nombreReserva.includes(a) || !r.apellido1);
  });
  return porNombre ?? hs[0];
}

// El contrato pendiente de firma se generó para otra persona (o no consta para quién): hay que regenerarlo.
function contratoDeOtroTitular(r: Reserva) {
  if (!r.contrato_pdf_id || r.contrato_firmado_at) return false;
  const titular = titularDe(r);
  return !titular || r.contrato_titular_huesped_id !== titular.id;
}

// Paso "Contrato": generar el PDF en Drive (función generar-contrato), enlaces y regenerar.
function ContratoPdf({ reserva, onCambio }: { reserva: Reserva; onCambio: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [generando, setGenerando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const titular = titularDe(reserva);
  const deOtro = contratoDeOtroTitular(reserva);

  async function generar(regenerar: boolean) {
    if (regenerar && !window.confirm("¿Volver a generar el contrato? El PDF anterior irá a la papelera de Drive.")) return;
    setGenerando(true);
    setMensaje(null);
    const { data, error } = await supabase.functions.invoke("generar-contrato", {
      body: { reserva_id: reserva.id, regenerar },
    });
    setGenerando(false);
    let r = data as any;
    if (error) {
      try {
        r = await (error as any).context?.json();
      } catch {}
    }
    if (!r?.ok) {
      const textos: Record<string, string> = {
        cliente_sin_configurar: "El cliente no tiene carpeta o plantilla de Drive (Maestros → Clientes).",
        sin_titular: "El titular aún no ha rellenado el formulario de huéspedes.",
        faltan_datos: `Faltan datos para la plantilla: ${[...(r?.faltan ?? []), ...(r?.desconocidos ?? []).map((d: string) => `${d} (marcador desconocido)`)].join(", ")}.`,
        ya_generado: "Ya hay un contrato generado.",
        google: `Error de Google Drive/Docs: ${r?.detalle ?? ""}`,
      };
      setMensaje({ tipo: "error", texto: textos[r?.error] ?? "No se ha podido generar el contrato." });
      return;
    }
    setMensaje({ tipo: "ok", texto: "Contrato generado en Drive." });
    onCambio();
  }

  const pdfUrl = reserva.contrato_pdf_id ? `https://drive.google.com/file/d/${reserva.contrato_pdf_id}/view` : null;
  const carpetaUrl = reserva.contrato_carpeta_id ? `https://drive.google.com/drive/folders/${reserva.contrato_carpeta_id}` : null;
  const generado = reserva.contrato_generado_at
    ? new Date(reserva.contrato_generado_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })
    : null;

  return (
    <div className="w-full rounded-md border border-line bg-paper p-2.5">
      <p className="text-xs text-ink/60">
        Titular: <span className="font-medium text-ink">{titular ? [titular.nombre, titular.apellido1, titular.apellido2].filter(Boolean).join(" ") : "— (falta el formulario)"}</span>
        {titular && <span className="text-ink/40"> · se cambia en la lista de huéspedes</span>}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {deOtro && (
          <p className="w-full rounded-md bg-clay/10 px-2.5 py-1.5 text-xs text-clay">
            El contrato para firma no está a nombre del titular actual
            {titular ? ` (${[titular.nombre, titular.apellido1].filter(Boolean).join(" ")})` : ""}. Regenéralo antes de enviarlo a firmar.
          </p>
        )}
        {/* Solo el contrato generado para la firma y la carpeta (donde también queda el firmado). */}
        {!reserva.contrato_pdf_id && !reserva.contrato_firmado_at && (
          <button
            type="button"
            disabled={generando || !titular}
            onClick={() => generar(false)}
            className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper disabled:opacity-40"
          >
            {generando ? "Generando…" : "Generar contrato PDF"}
          </button>
        )}
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${deOtro ? "border border-clay/40 bg-white text-clay line-through" : "bg-ink text-paper"}`}
          >
            Contrato para firma
          </a>
        )}
        {reserva.contrato_firmado_pdf_id && (
          <a
            href={`https://drive.google.com/file/d/${reserva.contrato_firmado_pdf_id}/view`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white"
          >
            Contrato firmado
          </a>
        )}
        {carpetaUrl && (
          <a href={carpetaUrl} target="_blank" rel="noreferrer" className="rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink/80 hover:text-ink">
            Abrir carpeta
          </a>
        )}
        {reserva.contrato_pdf_id && !reserva.contrato_firmado_at && (
          <button
            type="button"
            disabled={generando}
            onClick={() => generar(true)}
            className={deOtro ? "rounded-md bg-clay px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50" : "text-xs text-ink/50 underline hover:text-ink"}
          >
            {generando ? "Generando…" : deOtro ? "Regenerar para el titular" : "Regenerar"}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink/50">
        {reserva.contrato_firmado_at
          ? "Firmado: el PDF firmado está en la carpeta de la reserva."
          : generado
            ? `Generado el ${generado}. Súbelo a HelloSign; al llegar el correo de firma se guardará el PDF firmado y se marcará solo.`
            : "Aún no generado"}
      </p>
      {mensaje && (
        <p className={`mt-1 text-xs ${mensaje.tipo === "ok" ? "text-emerald-700" : "text-clay"}`}>{mensaje.texto}</p>
      )}
    </div>
  );
}

// Enlaces del contrato en el detalle de la entrada: el generado para la firma, el firmado y la carpeta.
function EnlacesContrato({ reserva }: { reserva: Reserva }) {
  const enlaces = [
    reserva.contrato_pdf_id && { texto: "Para firma", url: `https://drive.google.com/file/d/${reserva.contrato_pdf_id}/view` },
    reserva.contrato_firmado_pdf_id && { texto: "Firmado", url: `https://drive.google.com/file/d/${reserva.contrato_firmado_pdf_id}/view` },
    reserva.contrato_carpeta_id && { texto: "Carpeta", url: `https://drive.google.com/drive/folders/${reserva.contrato_carpeta_id}` },
  ].filter(Boolean) as { texto: string; url: string }[];
  if (!enlaces.length) return <span className="text-ink/40">Sin generar</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {enlaces.map((e) => (
        <a key={e.texto} href={e.url} target="_blank" rel="noreferrer" className="text-ink underline hover:text-clay">
          {e.texto}
        </a>
      ))}
    </span>
  );
}

// Dominio público de los formularios de huéspedes (CNAME en IONOS → Vercel).
const DOMINIO_REGISTRO = "https://registro.botonesmadrid.com";

// Enlace único del formulario (el mismo para todas las reservas): para las plantillas de mensajes de los portales.
// Los huéspedes rellenan sus fechas y los datos de todos; se vincula a la entrada por la fecha y el nombre.
function EnlaceGeneral() {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    const url = DOMINIO_REGISTRO;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt("Copia el enlace general del formulario:", url);
    }
  }
  return (
    <button
      type="button"
      onClick={copiar}
      title="El mismo enlace para todas las reservas: los huéspedes rellenan sus fechas y los datos de todos"
      className="rounded-md border border-line px-3 py-1.5 text-sm text-ink/70 hover:text-ink"
    >
      {copiado ? "Enlace copiado ✓" : "Copiar enlace general del formulario"}
    </button>
  );
}

// Paso "SES Hospedajes": genera el XML del parte de viajeros en la carpeta de Drive de la entrada (función
// ses-hospedajes). Se sube a mano a la plataforma SES y después se marca como comunicado.
function SesHospedajes({ reserva, onCambio }: { reserva: Reserva; onCambio: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [generando, setGenerando] = useState(false);
  const [errores, setErrores] = useState<{ quien: string; errores: string[] }[]>([]);
  const [mensaje, setMensaje] = useState("");

  async function generar() {
    if (reserva.ses_xml_id && !window.confirm("¿Volver a generar el XML? El anterior irá a la papelera de Drive.")) return;
    setGenerando(true);
    setErrores([]);
    setMensaje("");
    const { data, error } = await supabase.functions.invoke("ses-hospedajes", { body: { reserva_id: reserva.id } });
    setGenerando(false);
    let r = data as any;
    if (error) {
      try {
        r = await (error as any).context?.json();
      } catch {}
    }
    if (r?.ok) {
      setMensaje("XML generado en la carpeta de la entrada.");
      onCambio();
      return;
    }
    if (r?.error === "validacion") setErrores(r.errores ?? []);
    else setMensaje(r?.error === "google" ? `Error de Google Drive: ${r?.detalle ?? ""}` : "No se ha podido generar el XML.");
  }

  const generado = reserva.ses_generado_at
    ? new Date(reserva.ses_generado_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })
    : null;
  return (
    <div className="w-full rounded-md border border-line bg-paper p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={generando}
          onClick={generar}
          className={reserva.ses_xml_id ? "text-xs text-ink/50 underline hover:text-ink" : "rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper disabled:opacity-40"}
        >
          {generando ? "Generando…" : reserva.ses_xml_id ? "Regenerar XML" : "Generar XML SES"}
        </button>
        {reserva.ses_xml_id && (
          <a
            href={`https://drive.google.com/file/d/${reserva.ses_xml_id}/view`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper"
          >
            XML SES
          </a>
        )}
        {reserva.contrato_carpeta_id && (
          <a
            href={`https://drive.google.com/drive/folders/${reserva.contrato_carpeta_id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink/80 hover:text-ink"
          >
            Abrir carpeta
          </a>
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink/50">
        {reserva.ses_comunicado_at
          ? "Comunicado a SES Hospedajes."
          : generado
            ? `Generado el ${generado}. Súbelo a SES Hospedajes y márcalo como comunicado.`
            : "Aún no generado"}
      </p>
      {errores.length > 0 && (
        <div className="mt-1.5 rounded-md bg-clay/10 px-2.5 py-1.5 text-xs text-clay">
          <p className="font-medium">Faltan datos para el XML:</p>
          <ul className="mt-0.5 list-disc pl-4">
            {errores.map((e) => (
              <li key={e.quien}>
                <span className="font-medium">{e.quien}:</span> {e.errores.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {mensaje && <p className={`mt-1 text-xs ${mensaje.startsWith("XML") ? "text-emerald-700" : "text-clay"}`}>{mensaje}</p>}
    </div>
  );
}

// Enlace del formulario de huéspedes de esta entrada: copiarlo (se marca como enviado) o abrirlo.
function EnviarFormulario({ reserva, onEnviado }: { reserva: Reserva; onEnviado: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const enlace = `${DOMINIO_REGISTRO}/f/${reserva.formulario_token}`;
  const enviado = reserva.formulario_enviado_at
    ? new Date(reserva.formulario_enviado_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })
    : null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      window.prompt("Copia el enlace del formulario:", enlace);
    }
    onEnviado();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copiar}
        className="rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink/80 hover:text-ink"
      >
        {copiado ? "¡Copiado!" : "Copiar enlace"}
      </button>
      <a href={enlace} target="_blank" rel="noreferrer" className="text-xs text-ink/50 underline hover:text-ink">
        Ver formulario
      </a>
      <span className="text-xs text-ink/50">{enviado ? `Enviado el ${enviado}` : "Aún no enviado"}</span>
    </div>
  );
}

// Huéspedes que se alojan (el titular que solo reserva no cuenta).
const alojados = (r: { huespedes?: { es_huesped: boolean }[] | null }) =>
  (r.huespedes ?? []).filter((h) => h.es_huesped !== false).length;

// Pasos de la reserva en la propia fila del listado: hecho (verde), el siguiente
// por hacer (ámbar) y los que vienen después (gris). Al pulsar se abren las acciones.
function IndicadorPasos({ reserva: r, abierto, onAbrir }: { reserva: Reserva; abierto: boolean; onAbrir: () => void }) {
  const registrados = alojados(r);
  const pasos = [
    {
      clave: "importe",
      etiqueta: r.importe_pendiente || r.piso_pendiente ? "Info. obligatoria" : r.importe != null ? euros(r.importe) : "Info. obligatoria",
      hecho: !r.importe_pendiente && !r.piso_pendiente,
      titulo:
        [
          r.piso_pendiente && "Falta el piso",
          r.importe_pendiente && (r.importe != null && r.importe_neto == null ? "Falta la comisión" : "Falta el importe con comisión"),
        ]
          .filter(Boolean)
          .join(" · ") || "Información obligatoria: piso e importe",
    },
    {
      clave: "huespedes",
      etiqueta: `Huéspedes ${registrados}/${r.num_huespedes ?? "?"}`,
      hecho: !!r.formulario_completado_at,
      titulo: r.formulario_completado_at
        ? "Todos los huéspedes registrados"
        : r.formulario_enviado_at
          ? "Formulario enviado; faltan huéspedes"
          : "Formulario sin enviar",
      enviado: !r.formulario_completado_at && !!r.formulario_enviado_at,
    },
    {
      clave: "contrato",
      etiqueta: contratoDeOtroTitular(r) ? "Contrato ≠ titular" : "Contrato",
      hecho: !!r.contrato_firmado_at,
      titulo: r.contrato_firmado_at
        ? "Contrato firmado"
        : contratoDeOtroTitular(r)
          ? "El contrato para firma está a nombre de otra persona: regenéralo"
          : "Contrato sin firmar",
      aviso: contratoDeOtroTitular(r),
    },
    {
      clave: "ses",
      etiqueta: "SES",
      hecho: !!r.ses_comunicado_at || !!r.checkin_at,
      titulo: r.ses_comunicado_at
        ? "Comunicado a SES Hospedajes"
        : r.ses_xml_id
          ? "XML generado: falta subirlo a SES Hospedajes y marcarlo"
          : "Falta generar el XML de SES Hospedajes",
    },
    { clave: "checkin", etiqueta: "Check-in", hecho: !!r.checkin_at, titulo: r.checkin_at ? "Check-in completado" : "Check-in pendiente" },
  ];
  const siguiente = pasos.findIndex((p) => !p.hecho);

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-expanded={abierto}
      className={`group flex flex-wrap items-center gap-1 sm:flex-nowrap rounded-md p-0.5 text-left ${abierto ? "bg-paper" : "hover:bg-paper"}`}
      title="Ver y gestionar los pasos"
    >
      {pasos.map((p, i) => {
        const clase = p.hecho
          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
          : "aviso" in p && p.aviso
            ? "bg-clay/10 text-clay border-clay/40"
          : i === siguiente
            ? "bg-amber-50 text-amber-900 border-amber-300"
            : "bg-white text-ink/40 border-line";
        return (
          <span key={p.clave} className="flex items-center gap-1">
            {i > 0 && <span className="text-ink/25" aria-hidden>›</span>}
            <span title={p.titulo} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${clase}`}>
              <span aria-hidden>{p.hecho ? "✓" : i === siguiente ? "●" : "○"}</span>
              {p.etiqueta}
              {"enviado" in p && p.enviado && <span className="text-[10px] opacity-70">· enviado</span>}
            </span>
          </span>
        );
      })}
      <span className="ml-1 text-xs text-ink/40 group-hover:text-ink/70" aria-hidden>
        {abierto ? "▴" : "▾"}
      </span>
    </button>
  );
}

function EtiquetaFase({ fase }: { fase: Fase }) {
  const f = FASE[fase];
  if (!f) return null;
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${f.clase}`}>
      {f.etiqueta}
    </span>
  );
}

// Estado visual de un paso del flujo: hecho (verde), el siguiente por hacer (ámbar), con aviso (rojo) o pendiente (gris).
type EstadoPaso = "hecho" | "siguiente" | "aviso" | "pendiente";
const ESTILO_PASO: Record<EstadoPaso, { circulo: string; chip: string; texto: string }> = {
  hecho: { circulo: "border-emerald-600 bg-emerald-600 text-white", chip: "bg-emerald-50 text-emerald-800", texto: "Hecho" },
  siguiente: { circulo: "border-amber-400 bg-amber-50 text-amber-900", chip: "bg-amber-50 text-amber-900", texto: "Siguiente" },
  aviso: { circulo: "border-clay bg-clay/10 text-clay", chip: "bg-clay/10 text-clay", texto: "Revisar" },
  pendiente: { circulo: "border-line bg-white text-ink/40", chip: "bg-ink/5 text-ink/50", texto: "Pendiente" },
};

// Un paso del flujo: círculo numerado unido al siguiente por una línea, título con su estado, resumen y acciones.
function Paso({
  numero,
  titulo,
  estado,
  resumen,
  ultimo,
  children,
}: {
  numero: number;
  titulo: string;
  estado: EstadoPaso;
  resumen?: React.ReactNode;
  ultimo?: boolean;
  children?: React.ReactNode;
}) {
  const e = ESTILO_PASO[estado];
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!ultimo && <span aria-hidden className={`absolute left-[13px] top-7 bottom-0 w-px ${estado === "hecho" ? "bg-emerald-300" : "bg-line"}`} />}
      <span
        aria-hidden
        className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${e.circulo}`}
      >
        {estado === "hecho" ? "✓" : estado === "aviso" ? "!" : numero}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">{titulo}</h4>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.chip}`}>{e.texto}</span>
        </div>
        {resumen && <div className="mt-0.5 text-xs text-ink/60">{resumen}</div>}
        {children && <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </li>
  );
}

// Flujo de la reserva (en la fila del listado y en el detalle): los cinco pasos con el mismo formato.
// Mientras no estén automatizados (SES, check-in), se marcan a mano; la firma la marca el correo de HelloSign.
function PasosReserva({ reserva, onCambio, conDatos }: { reserva: Reserva; onCambio: () => void; conDatos?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const cancelada = reserva.estado === "cancelada";
  const yaLlego = reserva.fecha_entrada <= new Date().toISOString().slice(0, 10);

  async function actualizar(cambios: Record<string, unknown>, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return;
    setGuardando(true);
    setError("");
    const { error: err } = await supabase.from("reservas").update(cambios).eq("id", reserva.id);
    setGuardando(false);
    if (err) setError(err.message);
    else onCambio();
  }
  const ahora = () => new Date().toISOString();
  const fechaHora = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : null;

  const registrados = alojados(reserva);

  async function cambiarNumHuespedes() {
    const v = window.prompt("Número de huéspedes de la reserva (adultos + niños):", String(reserva.num_huespedes ?? registrados));
    if (v === null) return;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) {
      setError("Introduce un número entero mayor que 0.");
      return;
    }
    actualizar({ num_huespedes: n });
  }

  const deOtro = contratoDeOtroTitular(reserva);
  const hechos = [
    !reserva.importe_pendiente && !reserva.piso_pendiente,
    !!reserva.formulario_completado_at,
    !!reserva.contrato_firmado_at,
    !!reserva.ses_comunicado_at || !!reserva.checkin_at,
    !!reserva.checkin_at,
  ];
  const siguiente = hechos.findIndex((h) => !h);
  const estado = (i: number, aviso = false): EstadoPaso =>
    hechos[i] ? "hecho" : aviso ? "aviso" : i === siguiente && !cancelada ? "siguiente" : "pendiente";

  const bloqueoCheckin = reserva.piso_pendiente
    ? "Falta el piso"
    : reserva.importe_pendiente
      ? "Falta el importe"
      : deOtro
        ? "El contrato no está a nombre del titular: regenéralo"
        : !reserva.ses_comunicado_at
          ? "Falta comunicar a SES Hospedajes"
          : !yaLlego
            ? "Disponible desde el día de entrada"
            : null;
  const boton = "rounded-md border border-line bg-white px-2.5 py-1 text-xs text-ink/70 hover:text-ink disabled:opacity-40";
  const enlace = "text-xs text-ink/50 underline hover:text-ink";

  return (
    <div>
      {cancelada && (
        <p className="mb-3 rounded-md bg-clay/10 px-3 py-2 text-xs text-clay">
          Reserva cancelada{reserva.cancelada_at ? ` el ${fechaHora(reserva.cancelada_at)}` : ""}.
        </p>
      )}
      <ol>
        <Paso
          numero={1}
          titulo="Información obligatoria"
          estado={estado(0)}
          resumen={
            <>
              Piso {reserva.piso_pendiente ? <span className="text-clay">sin asignar</span> : reserva.apartamentos?.piso ?? "—"}
              {" · "}
              {reserva.importe_pendiente ? (
                <span className="text-clay">{reserva.importe != null && reserva.importe_neto == null ? "falta la comisión" : "falta el importe"}</span>
              ) : reserva.importe != null ? (
                <>
                  {euros(reserva.importe)}
                  {reserva.comision_portal != null && ` · comisión ${euros(reserva.comision_portal)}`}
                </>
              ) : (
                "sin importe"
              )}
              {conDatos && reserva.importe_neto != null && ` · neto ${euros(reserva.importe_neto)}`}
              {conDatos && reserva.formas_pago?.descripcion && ` · ${reserva.formas_pago.descripcion}`}
              {conDatos && reserva.fecha_pago && ` · pagado el ${formatoFecha(reserva.fecha_pago)}`}
            </>
          }
        >
          {!cancelada && reserva.piso_pendiente && <PisoPendiente reserva={reserva} onGuardado={onCambio} />}
          {!cancelada && <ImportePendiente reserva={reserva} onGuardado={onCambio} cambiar={!reserva.importe_pendiente} />}
        </Paso>

        <Paso
          numero={2}
          titulo="Formulario de huéspedes"
          estado={estado(1)}
          resumen={
            <>
              {registrados} de {reserva.num_huespedes ?? "?"} huéspedes registrados
              {reserva.formulario_completado_at && ` · completado el ${fechaHora(reserva.formulario_completado_at)}`}
            </>
          }
        >
          {!cancelada && !reserva.formulario_completado_at && (
            <EnviarFormulario reserva={reserva} onEnviado={() => actualizar({ formulario_enviado_at: ahora() })} />
          )}
          {!cancelada && (
            <button type="button" disabled={guardando} onClick={cambiarNumHuespedes} className={enlace}>
              Cambiar nº de huéspedes
            </button>
          )}
        </Paso>

        <Paso
          numero={3}
          titulo="Contrato firmado"
          estado={estado(2, deOtro)}
          resumen={
            reserva.contrato_firmado_at
              ? `Firmado el ${fechaHora(reserva.contrato_firmado_at)}`
              : "Se marca solo al llegar el correo de firma de HelloSign"
          }
        >
          {!cancelada && <ContratoPdf reserva={reserva} onCambio={onCambio} />}
          {cancelada && conDatos && <EnlacesContrato reserva={reserva} />}
        </Paso>

        <Paso
          numero={4}
          titulo="SES Hospedajes"
          estado={estado(3)}
          resumen={
            reserva.ses_comunicado_at
              ? `Comunicado el ${fechaHora(reserva.ses_comunicado_at)}`
              : reserva.ses_xml_id
                ? "XML generado: súbelo a SES Hospedajes y márcalo como comunicado"
                : "Genera el XML del parte de viajeros"
          }
        >
          {!cancelada && !reserva.checkin_at && <SesHospedajes reserva={reserva} onCambio={onCambio} />}
          {!cancelada &&
            (reserva.ses_comunicado_at ? (
              <button
                type="button"
                disabled={guardando}
                onClick={() => actualizar({ ses_comunicado_at: null }, "¿Deshacer «SES Hospedajes comunicado»?")}
                className={enlace}
              >
                Deshacer
              </button>
            ) : (
              <button
                type="button"
                disabled={guardando || !reserva.ses_xml_id}
                title={!reserva.ses_xml_id ? "Genera primero el XML" : undefined}
                onClick={() => actualizar({ ses_comunicado_at: ahora() })}
                className={boton}
              >
                Marcar comunicado
              </button>
            ))}
        </Paso>

        <Paso
          numero={5}
          titulo="Check-in"
          estado={estado(4)}
          ultimo
          resumen={
            reserva.checkin_at
              ? `Completado el ${fechaHora(reserva.checkin_at)}`
              : bloqueoCheckin ?? `Entrada el ${formatoFecha(reserva.fecha_entrada)}`
          }
        >
          {!cancelada &&
            (reserva.checkin_at ? (
              <button
                type="button"
                disabled={guardando}
                onClick={() => actualizar({ checkin_at: null }, "¿Deshacer el check-in?")}
                className={enlace}
              >
                Deshacer
              </button>
            ) : (
              <button
                type="button"
                disabled={guardando || !!bloqueoCheckin}
                title={bloqueoCheckin ?? undefined}
                onClick={() => actualizar({ checkin_at: ahora() })}
                className={boton}
              >
                Completar check-in
              </button>
            ))}
        </Paso>
      </ol>
      <div className="mt-4 flex justify-end border-t border-line pt-3">
        {cancelada ? (
          <button
            type="button"
            disabled={guardando}
            onClick={() => actualizar({ estado: "confirmada", cancelada_at: null }, "¿Reactivar esta reserva?")}
            className="text-xs text-ink/60 underline hover:text-ink"
          >
            Reactivar reserva
          </button>
        ) : (
          <button
            type="button"
            disabled={guardando}
            onClick={() =>
              actualizar(
                { estado: "cancelada", cancelada_at: ahora() },
                "¿Cancelar esta reserva? Se mantiene en el histórico como cancelada.",
              )
            }
            className="text-xs text-clay underline"
          >
            Cancelar reserva
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-clay">{error}</p>}
    </div>
  );
}

// Detalle de una entrada: cabecera con los datos de la reserva y, debajo, su flujo de pasos.
function DetalleEntrada({ reserva: r, onCambio }: { reserva: Reserva; onCambio: () => void }) {
  const datos: [string, React.ReactNode][] = [
    ["Entrada", formatoFecha(r.fecha_entrada)],
    ["Salida", formatoFecha(r.fecha_salida)],
    ["Noches", r.duracion ?? "—"],
    ["Reservada", formatoFecha(r.fecha_reserva)],
    ["Origen", r.origenes_reserva?.nombre ?? "—"],
    ["Código", r.codigo_reserva ?? "—"],
    ["Teléfono", r.telefono ?? "—"],
    ["Canal", r.canal ?? "—"],
  ];
  return (
    <div>
      <div className="rounded-lg border border-line bg-paper p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold leading-tight">
              {[r.nombre, r.apellido1, r.apellido2].filter(Boolean).join(" ")}
            </p>
            <p className="text-xs text-ink/60">
              {r.apartamentos?.piso ?? "—"} · {r.num_huespedes ?? "?"} huéspedes
            </p>
          </div>
          <EtiquetaFase fase={r.fase} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {datos.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-ink/45">{etiqueta}</dt>
              <dd className="truncate text-sm font-medium">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>
      <h3 className="mb-3 mt-5 text-xs font-medium uppercase tracking-wide text-ink/50">Flujo de la entrada</h3>
      <PasosReserva reserva={r} onCambio={onCambio} conDatos />
    </div>
  );
}

function formatoFecha(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function EntradasView({
  apartamentos,
  clientes,
  origenes,
}: {
  apartamentos: Apartamento[];
  clientes: Cliente[];
  origenes: Origen[];
}) {
  const supabase = useMemo(() => createClient(), []);

  // Por defecto: lo de los últimos 30 días y lo que llega en los próximos 60.
  const [rango, setRango] = useState<Rango>("ultimos31");
  const [desde, setDesde] = useState(() => rangoDe("ultimos31").desde);
  const [hasta, setHasta] = useState(() => rangoDe("ultimos31").hasta);

  const [apartamentoId, setApartamentoId] = useState("");
  const [clienteId, setClienteId] = useState("");

  const clientesPorId = useMemo(() => {
    return new Map(clientes.map((c) => [c.id, { ...c, color: hexCliente(c.color_calendario) }]));
  }, [clientes]);
  const [origen, setOrigen] = useState("");
  const [nochesMin, setNochesMin] = useState("");
  const [nochesMax, setNochesMax] = useState("");
  // Nº de filtros distintos de los de por defecto (se muestra en el botón "Filtros" del móvil).
  const filtrosActivos = [apartamentoId, clienteId, origen, nochesMin, nochesMax].filter(Boolean).length;
  const [estadoFiltro, setEstadoFiltro] = useState<FiltroEstado>("activas");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");

  // Acción pendiente elegida en el menú lateral (/?accion=…): muestra solo esas reservas,
  // sin límite de fechas y con los pasos desplegados para actuar directamente.
  const [accion, setAccion] = useState<Accion | null>(null);
  useEffect(() => {
    const leer = () => {
      const p = new URLSearchParams(window.location.search);
      const a = p.get("accion");
      setAccion(ACCIONES.some((x) => x.clave === a) ? (a as Accion) : null);
      const e = p.get("estado") ?? (p.get("pendientes") === "1" ? "pendiente_importe" : null);
      if (e && (e === "activas" || e === "todas" || e in FASE)) setEstadoFiltro(e as FiltroEstado);
    };
    leer();
    const alCambiar = (ev: Event) => setAccion((ev as CustomEvent<Accion>).detail);
    window.addEventListener("filtro-accion", alCambiar);
    window.addEventListener("popstate", leer);
    return () => {
      window.removeEventListener("filtro-accion", alCambiar);
      window.removeEventListener("popstate", leer);
    };
  }, []);
  const quitarAccion = () => {
    window.history.pushState(null, "", "/");
    setAccion(null);
  };
  const sinFechas = !!accion || FASES_TAREA.includes(estadoFiltro);

  // Espera a que se deje de escribir antes de lanzar la consulta.
  useEffect(() => {
    const t = setTimeout(() => setBusquedaAplicada(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [expandida, setExpandidaId] = useState<string | null>(null);
  const [pasosAbiertos, setPasosAbiertos] = useState<string | null>(null);
  const [detalleReserva, setDetalleReserva] = useState<Reserva | null>(null);
  const [detalleHuesped, setDetalleHuesped] = useState<Huesped | null>(null);
  const [reservaDelHuesped, setReservaDelHuesped] = useState<Reserva | null>(null);
  const [editando, setEditando] = useState(false);
  // Entrada en la que se está dando de alta un huésped a mano.
  const [altaHuespedEn, setAltaHuespedEn] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const cerrarDetalle = () => {
    setDetalleReserva(null);
    setDetalleHuesped(null);
    setEditando(false);
  };

  function elegirRango(r: Rango) {
    setRango(r);
    if (r === "personalizado") {
      if (!hasta) setHasta(sumarDias(desde, 60)); // al pasar desde "últimos 31 días", que no tiene fin
      return;
    }
    const { desde: d, hasta: h } = rangoDe(r);
    setDesde(d);
    setHasta(h);
  }

  async function cargar() {
    setCargando(true);
    setError("");

    let query = supabase
      .from("reservas")
      .select(
        `id, apartamento_id, fecha_reserva, fecha_entrada, fecha_salida, nombre, apellido1, apellido2,
         importe, comision_portal, codigo_reserva, telefono, fecha_pago, duracion, origen_codigo, forma_pago_codigo,
         estado, cancelada_at, canal, importe_neto, importe_pendiente, piso_pendiente, fase,
         formulario_enviado_at, formulario_completado_at, contrato_enviado_at, contrato_firmado_at, checkin_at,
         num_huespedes, formulario_token, titular_huesped_id, contrato_titular_huesped_id, ses_xml_id, ses_generado_at, ses_comunicado_at, contrato_generado_at, contrato_pdf_id, contrato_carpeta_id, contrato_firmado_pdf_id,
         apartamentos!inner(piso, cliente_id),
         origenes_reserva(nombre),
         formas_pago(descripcion),
         huespedes!huespedes_reserva_id_fkey(id, created_at, nombre, apellido1, apellido2, telefono, correo, fecha_nacimiento,
           soporte_documento, numero_documento, direccion, codigo_postal, nombre_municipio,
           tipo_documento_codigo, rol, sexo_codigo, parentesco_codigo, nacionalidad_codigo, pais_codigo,
           codigo_municipio_ref, motivo_viaje, es_huesped, nacionalidad:paises!huespedes_nacionalidad_codigo_fkey(nombre),
           tipos_documento(descripcion), sexos(descripcion), parentescos(descripcion))`
      )
      .order("fecha_entrada", { ascending: false });

    if (accion) {
      query = filtrarAccion(query, accion);
      query = query.order("fecha_entrada", { ascending: true }); // lo más urgente primero
    } else {
      if (!sinFechas) {
        if (desde) query = query.gte("fecha_entrada", desde);
        if (hasta) query = query.lte("fecha_entrada", hasta);
      }
      if (estadoFiltro === "activas") query = query.neq("fase", "cancelada");
      else if (estadoFiltro !== "todas") query = query.eq("fase", estadoFiltro);
    }

    if (apartamentoId) query = query.eq("apartamento_id", apartamentoId);
    if (clienteId) query = query.eq("apartamentos.cliente_id", clienteId);
    if (origen === SIN_ORIGEN) query = query.is("origen_codigo", null);
    else if (origen) query = query.eq("origen_codigo", origen);
    if (nochesMin !== "") query = query.gte("duracion", Number(nochesMin));
    if (nochesMax !== "") query = query.lte("duracion", Number(nochesMax));

    // Búsqueda por titular: cada palabra tiene que aparecer en el nombre o en
    // alguno de los apellidos. Se quitan los caracteres con significado
    // especial en los filtros de PostgREST.
    const palabras = busquedaAplicada
      .replace(/[,()*%\\:."']/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    for (const p of palabras) {
      query = query.or(`nombre.ilike.%${p}%,apellido1.ilike.%${p}%,apellido2.ilike.%${p}%`);
    }

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setReservas([]);
    } else {
      setReservas((data as any) ?? []);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, apartamentoId, clienteId, origen, nochesMin, nochesMax, busquedaAplicada, estadoFiltro, accion]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        <AvisosRevisar tipo="reservas" onCambio={cargar} />
        <AvisosRevisar tipo="contratos" onCambio={cargar} />
        <RegistrosPendientes onCambio={cargar} />
        <EnlaceGeneral />
        <button
          type="button"
          onClick={() => setNueva(true)}
          className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/90"
        >
          + Nueva entrada
        </button>
      </div>
      {nueva && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:px-4" onClick={() => setNueva(false)}>
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold">Nueva entrada</h2>
              <button type="button" onClick={() => setNueva(false)} className="text-sm text-ink/50 hover:text-ink">
                Cerrar
              </button>
            </div>
            <p className="mb-3 text-xs text-ink/50">
              Para reservas confirmadas que no llegan por Avirato. Sigue el mismo flujo que el resto: importe, formulario
              de huéspedes, contrato y check-in.
            </p>
            <EditarReserva
              reserva={{
                id: "",
                apartamento_id: apartamentoId || apartamentos.find((a) => a.piso !== "SIN ASIGNAR")?.id || apartamentos[0]?.id || "",
                fecha_reserva: hoyISO(),
                fecha_entrada: "",
                fecha_salida: "",
                nombre: "",
                apellido1: null,
                apellido2: null,
                importe: null,
                importe_neto: null,
                comision_portal: null,
                importe_pendiente: true,
                codigo_reserva: null,
                telefono: null,
                origen_codigo: null,
                forma_pago_codigo: null,
                fecha_pago: null,
                num_huespedes: null,
              }}
              apartamentos={apartamentos}
              onGuardado={() => {
                setNueva(false);
                cargar();
              }}
              onCancelar={() => setNueva(false)}
            />
          </div>
        </div>
      )}
      {/* Filtros */}
      <div className="rounded-lg border border-line bg-white p-4">
        <div className="mb-4">
          <label htmlFor="busqueda">Buscar por titular de la reserva</label>
          <input
            id="busqueda"
            type="search"
            placeholder="Nombre o apellidos"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        {/* En el móvil el resto de filtros va plegado */}
        <button
          type="button"
          onClick={() => setFiltrosAbiertos((v) => !v)}
          aria-expanded={filtrosAbiertos}
          className="-mt-1 mb-1 flex w-full items-center justify-between rounded-md border border-line px-3 py-2 text-sm text-ink/70 md:hidden"
        >
          <span>
            Filtros
            {filtrosActivos > 0 && (
              <span className="ml-2 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-paper">{filtrosActivos}</span>
            )}
          </span>
          <span aria-hidden>{filtrosAbiertos ? "▴" : "▾"}</span>
        </button>
        <div className={filtrosAbiertos ? "mt-3" : "hidden md:block"}>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/50">
          Fecha de entrada
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ["ultimos31", "Últimos 31 días y próximas"],
              ["mas7", "± 7 días"],
              ["semana", "Esta semana"],
              ["mes", "Este mes"],
              ["anio", "Este año"],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              onClick={() => elegirRango(valor)}
              className={`rounded-md px-3 py-1.5 ${rango === valor ? "bg-ink text-paper" : "border border-line text-ink/70"}`}
            >
              {texto}
            </button>
          ))}
          <button
            type="button"
            onClick={() => elegirRango("personalizado")}
            className={`rounded-md px-3 py-1.5 ${
              rango === "personalizado" ? "bg-ink text-paper" : "border border-line text-ink/70"
            }`}
          >
            Rango personalizado
          </button>
        </div>

        {rango === "personalizado" && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="desde">Entrada desde</label>
              <input
                id="desde"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="hasta">Entrada hasta</label>
              <input
                id="hasta"
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="apartamento">Piso</label>
            <select
              id="apartamento"
              value={apartamentoId}
              onChange={(e) => setApartamentoId(e.target.value)}
            >
              <option value="">Todos</option>
              {apartamentos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.piso}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cliente">Cliente</label>
            <select id="cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="origen">Origen</label>
            <select id="origen" value={origen} onChange={(e) => setOrigen(e.target.value)}>
              <option value="">Todos</option>
              {origenes.map((o) => (
                <option key={o.codigo} value={o.codigo}>
                  {o.nombre}
                </option>
              ))}
              <option value={SIN_ORIGEN}>Sin origen</option>
            </select>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-ink/60">Duración (noches)</span>
            <div className="flex items-center gap-2">
              <input
                aria-label="Noches mínimas"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Mín."
                value={nochesMin}
                onChange={(e) => setNochesMin(e.target.value)}
              />
              <span className="text-ink/40">–</span>
              <input
                aria-label="Noches máximas"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Máx."
                value={nochesMax}
                onChange={(e) => setNochesMax(e.target.value)}
              />
            </div>
          </div>
        </div>
        </div>
      </div>

      {accion && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span>
            <span className="font-medium">Pendientes: {ACCIONES.find((a) => a.clave === accion)?.etiqueta}</span>
            <span className="text-amber-900/70"> · {ACCIONES.find((a) => a.clave === accion)?.ayuda}. Todas las fechas.</span>
          </span>
          <button type="button" onClick={quitarAccion} className="ml-auto text-xs underline">
            Quitar filtro
          </button>
        </div>
      )}

      <div className={`mt-3 flex flex-wrap items-end gap-3 text-sm ${accion ? "hidden" : ""}`}>
        <div className="w-full sm:w-72">
          <label htmlFor="estado">Estado</label>
          <select
            id="estado"
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value as FiltroEstado)}
          >
            <option value="activas">Activas (todas menos canceladas)</option>
            {FASES.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.etiqueta}
              </option>
            ))}
            <option value="todas">Todas</option>
          </select>
        </div>
        {sinFechas && (
          <span className="pb-2 text-xs text-ink/50">
            Se muestran todas las fechas: son tareas por hacer.
          </span>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-clay">{error}</p>}

      {/* Listado */}
      <div className="mt-6 space-y-3">
        {cargando ? (
          <p className="py-8 text-center text-sm text-ink/40">Cargando…</p>
        ) : reservas.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink/40">
            No hay entradas para este filtro.
          </p>
        ) : (
          reservas.map((r) => {
            const apartamento = r.apartamentos;
            const origen = r.origenes_reserva?.nombre;
            const abierta = expandida === r.id;
            // Desde una acción pendiente los pasos van desplegados (salvo el importe, que tiene su burbuja).
            const conPasos = accion ? pasosAbiertos !== r.id : pasosAbiertos === r.id;
            const cliente = r.apartamentos?.cliente_id ? clientesPorId.get(r.apartamentos.cliente_id) : undefined;
            return (
              <div
                key={r.id}
                className={`relative overflow-hidden rounded-lg border border-line bg-white pl-1.5 before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-[var(--color-cliente)] ${
                  r.fase === "cancelada" ? "opacity-60" : ""
                }`}
                style={{ "--color-cliente": cliente?.color ?? SIN_CLIENTE } as React.CSSProperties}
              >
                {/* Todas las entradas con la misma altura: en pantalla ancha (≥1360 px) una línea con columnas fijas;
                    en portátil/tableta siempre dos líneas (datos y botones / pasos); en móvil se reparte. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid sm:grid-cols-[2.75rem_10.5rem_minmax(0,1fr)_auto] sm:gap-x-4 min-[1360px]:grid-cols-[2.75rem_10.5rem_minmax(0,1fr)_auto_auto]">
                  <span
                    title={cliente?.nombre ?? "Sin cliente"}
                    className="inline-flex h-9 w-11 shrink-0 items-center justify-center rounded-md text-xs font-bold tracking-wide sm:row-span-2 min-[1360px]:row-span-1"
                    style={{
                      color: cliente?.color ?? SIN_CLIENTE,
                      background: `${cliente?.color ?? SIN_CLIENTE}1a`,
                      boxShadow: `inset 0 0 0 1px ${cliente?.color ?? SIN_CLIENTE}66`,
                    }}
                  >
                    {cliente?.codigo ?? cliente?.nombre?.slice(0, 2).toUpperCase() ?? "—"}
                  </span>
                  <div className="min-w-[10.5rem] sm:min-w-0">
                    <div className="whitespace-nowrap text-sm font-medium">
                      {formatoFecha(r.fecha_entrada)} → {formatoFecha(r.fecha_salida)}
                    </div>
                    <div className={`truncate text-xs ${r.piso_pendiente ? "text-amber-700" : "text-ink/50"}`}>
                      {apartamento?.piso}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 sm:flex-none">
                    <div className="truncate text-sm" title={`${r.nombre} ${r.apellido1 ?? ""}`}>
                      {r.nombre} {r.apellido1 ?? ""}
                    </div>
                    <div className="truncate text-xs text-ink/50">{origen ?? "Sin origen"}</div>
                  </div>
                  <div className="w-full min-w-0 text-sm sm:w-auto sm:col-span-3 sm:col-start-2 sm:row-start-2 min-[1360px]:col-span-1 min-[1360px]:col-start-4 min-[1360px]:row-start-1">
                    {r.fase === "cancelada" ? (
                      <EtiquetaFase fase={r.fase} />
                    ) : (
                      <IndicadorPasos
                        reserva={r}
                        abierto={conPasos}
                        onAbrir={() => setPasosAbiertos(pasosAbiertos === r.id ? null : r.id)}
                      />
                    )}
                  </div>

                  <div className="flex w-full items-center justify-end gap-3 whitespace-nowrap text-sm sm:ml-auto sm:w-auto sm:col-start-4 sm:row-start-1 min-[1360px]:col-start-5">
                    <button
                      type="button"
                      onClick={() => setExpandidaId(abierta ? null : r.id)}
                      className="text-ink/60 hover:text-ink"
                    >
                      {abierta ? "Ocultar huéspedes" : `Huéspedes (${alojados(r)})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetalleReserva(r)}
                      className="rounded-md border border-line px-3 py-1.5 text-ink/70 hover:text-ink"
                    >
                      Detalle
                    </button>
                  </div>
                </div>

                {conPasos && (
                  <div className="border-t border-line bg-paper px-4 py-3">
                    <PasosReserva
                      reserva={r}
                      onCambio={() => {
                        window.dispatchEvent(new Event("pendientes-cambiados"));
                        cargar();
                      }}
                    />
                  </div>
                )}

                {abierta && (
                  <div className="border-t border-line bg-paper px-4 py-3">
                    {r.huespedes && r.huespedes.length > 0 ? (
                      <ul className="space-y-2">
                        {r.huespedes.map((h) => (
                          <li
                            key={h.id}
                            className="flex flex-wrap items-center gap-4 rounded-md border border-line bg-white px-3 py-2 text-sm"
                          >
                            <div className="min-w-[160px] font-medium">
                              {h.nombre} {h.apellido1 ?? ""} {h.apellido2 ?? ""}
                              {!h.es_huesped && (
                                <span className="ml-2 rounded bg-ink/5 px-1.5 py-0.5 text-[11px] font-normal text-ink/60">solo titular</span>
                              )}
                            </div>
                            <div className="text-ink/60">{h.nacionalidad?.nombre ?? "—"}</div>
                            <div className="text-ink/60">{h.telefono ?? "—"}</div>
                            <div className="text-ink/60">{h.correo ?? "—"}</div>
                            <label className="!mb-0 flex items-center gap-1.5 !text-xs !font-normal !text-ink/70" title="Titular de la reserva: quien firma el contrato">
                              <input
                                type="checkbox"
                                className="!w-auto"
                                checked={titularDe(r)?.id === h.id}
                                onChange={async (e) => {
                                  if (!e.target.checked) return;
                                  await supabase.from("reservas").update({ titular_huesped_id: h.id }).eq("id", r.id);
                                  cargar();
                                }}
                              />
                              Titular
                            </label>
                            <label className="!mb-0 flex items-center gap-1.5 !text-xs !font-normal !text-ink/70" title="Se aloja en esta entrada. Desmarcado: solo es titular (firma el contrato), no cuenta como huésped ni va al parte de SES">
                              <input
                                type="checkbox"
                                className="!w-auto"
                                checked={h.es_huesped}
                                onChange={async (e) => {
                                  await supabase.from("huespedes").update({ es_huesped: e.target.checked }).eq("id", h.id);
                                  window.dispatchEvent(new Event("pendientes-cambiados"));
                                  cargar();
                                }}
                              />
                              Se aloja
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setDetalleHuesped(h);
                                setReservaDelHuesped(r);
                              }}
                              className="ml-auto text-ink/50 underline hover:text-ink"
                            >
                              Detalle
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-ink/40">Sin huéspedes registrados.</p>
                    )}
                    {r.fase !== "cancelada" && (
                      <button
                        type="button"
                        onClick={() => setAltaHuespedEn(r.id)}
                        className="mt-2 inline-block text-xs text-ink/60 underline hover:text-ink"
                      >
                        + Añadir huésped a mano
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {detalleReserva && (
        <ModalDetalle
          ancho
          titulo={editando ? "Editar entrada" : "Detalle de la entrada"}
          onCerrar={cerrarDetalle}
          onEditar={editando ? undefined : () => setEditando(true)}
        >
          {editando ? (
            <EditarReserva
              reserva={detalleReserva}
              apartamentos={apartamentos}
              onCancelar={() => setEditando(false)}
              onGuardado={() => {
                cerrarDetalle();
                cargar();
              }}
            />
          ) : (
            <DetalleEntrada
              reserva={reservas.find((x) => x.id === detalleReserva.id) ?? detalleReserva}
              onCambio={() => {
                window.dispatchEvent(new Event("pendientes-cambiados"));
                cargar();
              }}
            />
          )}
          {!editando && (
            <AccionesEntrada
              reserva={detalleReserva}
              onHecho={() => {
                cerrarDetalle();
                cargar();
              }}
            />
          )}
        </ModalDetalle>
      )}

      {altaHuespedEn && (
        <ModalDetalle titulo="Añadir huésped" onCerrar={() => setAltaHuespedEn(null)}>
          <EditarHuesped
            huesped={HUESPED_NUEVO}
            reservaId={altaHuespedEn}
            onCancelar={() => setAltaHuespedEn(null)}
            onGuardado={() => {
              setAltaHuespedEn(null);
              cargar();
              window.dispatchEvent(new Event("pendientes-cambiados"));
            }}
          />
        </ModalDetalle>
      )}

      {detalleHuesped && (
        <ModalDetalle
          titulo={editando ? "Editar huésped" : "Detalle del huésped"}
          onCerrar={cerrarDetalle}
          onEditar={editando ? undefined : () => setEditando(true)}
        >
          {editando ? (
            <EditarHuesped
              huesped={detalleHuesped}
              onCancelar={() => setEditando(false)}
              onGuardado={() => {
                cerrarDetalle();
                cargar();
              }}
            />
          ) : (
          <dl className="space-y-2">
          <FilaDetalle
            etiqueta="Nombre completo"
            valor={`${detalleHuesped.nombre} ${detalleHuesped.apellido1 ?? ""} ${
              detalleHuesped.apellido2 ?? ""
            }`}
          />
          <FilaDetalle etiqueta="Nacionalidad" valor={detalleHuesped.nacionalidad?.nombre} />
          <FilaDetalle etiqueta="Fecha de nacimiento" valor={formatoFecha(detalleHuesped.fecha_nacimiento)} />
          <FilaDetalle etiqueta="Tipo de documento" valor={detalleHuesped.tipos_documento?.descripcion} />
          <FilaDetalle etiqueta="Nº documento" valor={detalleHuesped.numero_documento} />
          <FilaDetalle etiqueta="Soporte del documento" valor={detalleHuesped.soporte_documento} />
          <FilaDetalle etiqueta="Dirección" valor={detalleHuesped.direccion} />
          <FilaDetalle etiqueta="Código postal" valor={detalleHuesped.codigo_postal} />
          <FilaDetalle etiqueta="Municipio" valor={detalleHuesped.nombre_municipio} />
          <FilaDetalle etiqueta="Teléfono" valor={detalleHuesped.telefono} />
          <FilaDetalle etiqueta="Correo" valor={detalleHuesped.correo} />
          <FilaDetalle etiqueta="Rol" valor={detalleHuesped.rol} />
          <FilaDetalle etiqueta="Sexo" valor={detalleHuesped.sexos?.descripcion} />
          <FilaDetalle etiqueta="Parentesco" valor={detalleHuesped.parentescos?.descripcion} />
          <FilaDetalle etiqueta="Motivo del viaje" valor={detalleHuesped.motivo_viaje} />
          </dl>
          )}
          {!editando && reservaDelHuesped && (
            <>
              <MoverHuesped
                huesped={detalleHuesped}
                fechaRef={reservaDelHuesped.fecha_entrada}
                reservaId={reservaDelHuesped.id}
                onHecho={() => {
                  cerrarDetalle();
                  cargar();
                }}
              />
              <CopiarTitular
                huesped={detalleHuesped}
                fechaRef={reservaDelHuesped.fecha_entrada}
                reservaId={reservaDelHuesped.id}
                onHecho={() => {
                  cerrarDetalle();
                  cargar();
                }}
              />
            </>
          )}
          {!editando && (
            <EliminarHuesped
              huesped={detalleHuesped}
              onHecho={() => {
                cerrarDetalle();
                cargar();
              }}
            />
          )}
        </ModalDetalle>
      )}
    </div>
  );
}

function ModalDetalle({
  titulo,
  onCerrar,
  onEditar,
  ancho,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  onEditar?: () => void;
  ancho?: boolean;
  children: React.ReactNode;
}) {
  // Pulsar fuera cierra solo en modo consulta (al editar se perderían los cambios).
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4" onClick={onEditar ? onCerrar : undefined}>
      <div
        className={`max-h-[85vh] w-full ${ancho ? "max-w-2xl" : "max-w-lg"} overflow-y-auto rounded-lg bg-white p-6`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{titulo}</h2>
          <div className="flex items-center gap-3">
            {onEditar && (
              <button onClick={onEditar} className="rounded-md border border-line px-3 py-1 text-sm text-ink/70 hover:text-ink">
                Editar
              </button>
            )}
            <button onClick={onCerrar} className="text-sm text-ink/50 hover:text-ink">
              Cerrar
            </button>
          </div>
        </div>
        <div className="mt-4 text-sm">{children}</div>
      </div>
    </div>
  );
}

function FilaDetalle({ etiqueta, valor }: { etiqueta: string; valor: any }) {
  const vacio = valor === null || valor === undefined || valor === "";
  return (
    <div className="flex justify-between gap-4 border-b border-line pb-2">
      <dt className="text-ink/50">{etiqueta}</dt>
      <dd className="text-right font-medium">{vacio ? "—" : valor}</dd>
    </div>
  );
}
