"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EditarHuesped, EditarReserva } from "./Edicion";
import { AccionesEntrada, MoverHuesped } from "./Combinar";
import RegistrosPendientes from "./RegistrosPendientes";
import { ACCIONES, filtrarAccion, type Accion } from "@/lib/acciones";

type Apartamento = { id: string; piso: string };
type Cliente = { id: string; nombre: string; codigo: string | null; created_at: string };

// Color fijo por cliente (por orden de alta: un cliente nuevo no cambia los colores de los demás).
const COLORES_CLIENTE = [
  { franja: "before:bg-sky-500", etiqueta: "bg-sky-100 text-sky-900 ring-sky-300" },
  { franja: "before:bg-amber-500", etiqueta: "bg-amber-100 text-amber-900 ring-amber-300" },
  { franja: "before:bg-violet-500", etiqueta: "bg-violet-100 text-violet-900 ring-violet-300" },
  { franja: "before:bg-emerald-500", etiqueta: "bg-emerald-100 text-emerald-900 ring-emerald-300" },
  { franja: "before:bg-rose-500", etiqueta: "bg-rose-100 text-rose-900 ring-rose-300" },
  { franja: "before:bg-teal-500", etiqueta: "bg-teal-100 text-teal-900 ring-teal-300" },
  { franja: "before:bg-orange-500", etiqueta: "bg-orange-100 text-orange-900 ring-orange-300" },
  { franja: "before:bg-indigo-500", etiqueta: "bg-indigo-100 text-indigo-900 ring-indigo-300" },
];
const SIN_CLIENTE = { franja: "before:bg-line", etiqueta: "bg-paper text-ink/50 ring-line" };
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
  | "lista_checkin"
  | "checkin_completado"
  | "cancelada";

const FASES: { valor: Fase; etiqueta: string; clase: string }[] = [
  { valor: "pendiente_importe", etiqueta: "Información obligatoria", clase: "bg-amber-100 text-amber-900" },
  { valor: "pendiente_documentacion", etiqueta: "Pendiente de documentación", clase: "bg-sky-100 text-sky-900" },
  { valor: "lista_checkin", etiqueta: "Lista para check-in", clase: "bg-emerald-100 text-emerald-900" },
  { valor: "checkin_completado", etiqueta: "Check-in completado", clase: "bg-ink/10 text-ink/70" },
  { valor: "cancelada", etiqueta: "Cancelada", clase: "bg-clay/10 text-clay" },
];
const FASE = Object.fromEntries(FASES.map((f) => [f.valor, f])) as Record<Fase, (typeof FASES)[number]>;

// Filtro de estado: las fases + "activas" (todo menos canceladas) + "todas".
type FiltroEstado = Fase | "activas" | "todas";
// Fases que son tareas por hacer: se muestran sin limitar por fechas.
const FASES_TAREA: FiltroEstado[] = ["pendiente_importe", "pendiente_documentacion", "lista_checkin"];

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

// Paso "Contrato": generar el PDF en Drive (función generar-contrato), enlaces y regenerar.
function ContratoPdf({ reserva, onCambio }: { reserva: Reserva; onCambio: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [generando, setGenerando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const titular = titularDe(reserva);

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
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper">
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
          <button type="button" disabled={generando} onClick={() => generar(true)} className="text-xs text-ink/50 underline hover:text-ink">
            {generando ? "Generando…" : "Regenerar"}
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

// Envío del enlace del formulario al titular: WhatsApp, email o copiar.
function EnviarFormulario({ reserva, onEnviado }: { reserva: Reserva; onEnviado: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [modoEmail, setModoEmail] = useState(false);
  const [destinatario, setDestinatario] = useState("");
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [resultadoEmail, setResultadoEmail] = useState<"" | "ok" | string>("");

  // El email del titular viene en el último aviso del channel manager (si lo trae).
  useEffect(() => {
    supabase
      .from("avisos_canal")
      .select("datos")
      .eq("reserva_id", reserva.id)
      .order("recibido_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const e = (data?.[0]?.datos as any)?.email ?? null;
        setEmail(e);
        setDestinatario((d) => d || e || "");
      });
  }, [reserva.id, supabase]);

  const enlace = `${DOMINIO_REGISTRO}/f/${reserva.formulario_token}`;
  const nombre = reserva.nombre.split(" ")[0];
  const n = reserva.num_huespedes;
  const fechas = `${formatoFecha(reserva.fecha_entrada)} – ${formatoFecha(reserva.fecha_salida)}`;
  const mensaje =
    `Hola ${nombre}, para completar tu reserva (${fechas}) necesitamos los datos de ${n ? `los ${n} huéspedes` : "todos los huéspedes"}, ` +
    `es obligatorio por ley en España. Son 2 minutos por persona:\n${enlace}\n\n` +
    `Hi ${nombre}, to complete your booking (${fechas}) we need the details of ${n ? `all ${n} guests` : "all guests"}, ` +
    `as required by Spanish law. It takes 2 minutes per person:\n${enlace}\n\nEl Botones Madrid`;
  const telefono = (reserva.telefono ?? "").replace(/\D/g, "");
  const whatsapp = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
  const mailto =
    `mailto:${destinatario || email || ""}?subject=${encodeURIComponent("Registro de huéspedes / Guest registration · El Botones Madrid")}` +
    `&body=${encodeURIComponent(mensaje)}`;

  const enviado = reserva.formulario_enviado_at
    ? new Date(reserva.formulario_enviado_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })
    : null;

  return (
    <div className="w-full rounded-md border border-line bg-paper p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          onClick={onEnviado}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
          title={telefono ? `Abrir WhatsApp con +${telefono}` : "Sin teléfono: elegirás el contacto en WhatsApp"}
        >
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => setModoEmail((v) => !v)}
          className="rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink/80 hover:text-ink"
        >
          Email
        </button>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(enlace);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
            onEnviado();
          }}
          className="rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink/80 hover:text-ink"
        >
          {copiado ? "¡Copiado!" : "Copiar enlace"}
        </button>
        <a href={enlace} target="_blank" rel="noreferrer" className="text-xs text-ink/50 underline hover:text-ink">
          Ver formulario
        </a>
      </div>
      {modoEmail && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setEnviandoEmail(true);
            setResultadoEmail("");
            const { data, error } = await supabase.functions.invoke("enviar-formulario", {
              body: { reserva_id: reserva.id, destinatario },
            });
            setEnviandoEmail(false);
            if (error || !(data as any)?.ok) {
              let motivo = (data as any)?.error ?? "";
              try {
                motivo = (await (error as any)?.context?.json())?.error ?? motivo;
              } catch {}
              setResultadoEmail(
                motivo === "email_invalido" ? "Revisa la dirección de email." : "No se ha podido enviar. Prueba con «abrir en mi correo».",
              );
              return;
            }
            setResultadoEmail("ok");
            onEnviado();
          }}
        >
          <input
            type="email"
            required
            aria-label="Email del titular"
            placeholder="email del titular"
            className="!w-64 !py-1 !text-xs"
            value={destinatario}
            onChange={(e) => setDestinatario(e.target.value)}
          />
          <button
            type="submit"
            disabled={enviandoEmail || !destinatario}
            className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper disabled:opacity-40"
          >
            {enviandoEmail ? "Enviando…" : "Enviar email"}
          </button>
          <a href={mailto} onClick={onEnviado} className="text-xs text-ink/50 underline hover:text-ink">
            o abrir en mi correo
          </a>
          {resultadoEmail === "ok" && <span className="text-xs text-emerald-700">✓ Email enviado desde hola@botonesmadrid.com</span>}
          {resultadoEmail && resultadoEmail !== "ok" && <span className="text-xs text-clay">{resultadoEmail}</span>}
        </form>
      )}
      <p className="mt-1.5 text-xs text-ink/50">
        {enviado ? `Enviado el ${enviado}` : "Aún no enviado"}
        {!telefono && " · sin teléfono del titular"}
        {email === null ? "" : ` · ${email}`}
      </p>
    </div>
  );
}

// Pasos de la reserva en la propia fila del listado: hecho (verde), el siguiente
// por hacer (ámbar) y los que vienen después (gris). Al pulsar se abren las acciones.
function IndicadorPasos({ reserva: r, abierto, onAbrir }: { reserva: Reserva; abierto: boolean; onAbrir: () => void }) {
  const registrados = r.huespedes?.length ?? 0;
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
    { clave: "contrato", etiqueta: "Contrato", hecho: !!r.contrato_firmado_at, titulo: r.contrato_firmado_at ? "Contrato firmado" : "Contrato sin firmar" },
    { clave: "checkin", etiqueta: "Check-in", hecho: !!r.checkin_at, titulo: r.checkin_at ? "Check-in completado" : "Check-in pendiente" },
  ];
  const siguiente = pasos.findIndex((p) => !p.hecho);

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-expanded={abierto}
      className={`group flex flex-wrap items-center gap-1 rounded-md p-0.5 text-left ${abierto ? "bg-paper" : "hover:bg-paper"}`}
      title="Ver y gestionar los pasos"
    >
      {pasos.map((p, i) => {
        const clase = p.hecho
          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
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

// Pasos del flujo en el detalle de la reserva. Mientras no estén automatizados
// (formulario, firma con HelloSign, check-in), se pueden marcar a mano.
function PasosReserva({ reserva, onCambio }: { reserva: Reserva; onCambio: () => void }) {
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

  const registrados = reserva.huespedes?.length ?? 0;

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

  // El formulario se completa solo cuando están registrados todos los huéspedes.
  // El contrato solo lo firma el titular.
  // La firma del contrato no se marca a mano: la marca el correo de HelloSign (y su PDF firmado queda en la carpeta).
  const pasos: { etiqueta: string; hecho: string | null; campo: string; accion: string; disabled?: boolean; ayuda?: string; automatico?: string }[] = [
    {
      etiqueta: "Contrato firmado (titular)",
      hecho: reserva.contrato_firmado_at,
      campo: "contrato_firmado_at",
      accion: "",
      automatico: "Se marca al llegar el correo de firma de HelloSign",
    },
    {
      etiqueta: "Check-in",
      hecho: reserva.checkin_at,
      campo: "checkin_at",
      accion: "Completar check-in",
      disabled: !yaLlego || reserva.importe_pendiente || reserva.piso_pendiente,
      ayuda: reserva.piso_pendiente
        ? "Falta el piso"
        : reserva.importe_pendiente
          ? "Falta el importe"
          : !yaLlego
            ? "Disponible desde el día de entrada"
            : undefined,
    },
  ];

  return (
    <div>
      <ul className="space-y-2">
        <li className="text-xs font-medium uppercase tracking-wide text-ink/50">Información obligatoria</li>
        <li className="flex flex-wrap items-center justify-between gap-3">
          <span>
            {reserva.piso_pendiente ? "○" : "✓"} Piso
            {!reserva.piso_pendiente && <span className="ml-2 text-xs text-ink/50">{reserva.apartamentos?.piso ?? "—"}</span>}
          </span>
          {!cancelada && reserva.piso_pendiente && <PisoPendiente reserva={reserva} onGuardado={onCambio} />}
        </li>
        <li className="flex flex-wrap items-center justify-between gap-3">
          <span>
            {reserva.importe_pendiente ? "○" : "✓"} Importe con comisión
            {!reserva.importe_pendiente && reserva.importe != null && (
              <span className="ml-2 text-xs text-ink/50">
                {euros(reserva.importe)}
                {reserva.comision_portal != null && ` · comisión ${euros(reserva.comision_portal)}`}
              </span>
            )}
          </span>
          {!cancelada && (
            <ImportePendiente reserva={reserva} onGuardado={onCambio} cambiar={!reserva.importe_pendiente} />
          )}
        </li>
        <li className="flex flex-wrap items-center justify-between gap-3">
          <span>
            {reserva.formulario_completado_at ? "✓" : "○"} Formulario de huéspedes
            <span className="ml-2 text-xs text-ink/50">
              {registrados} de {reserva.num_huespedes ?? "?"} registrados
            </span>
          </span>
          {!cancelada && (
            <button
              type="button"
              disabled={guardando}
              onClick={cambiarNumHuespedes}
              className="text-xs text-ink/50 underline hover:text-ink"
            >
              Cambiar nº de huéspedes
            </button>
          )}
          {!cancelada && !reserva.formulario_completado_at && (
            <EnviarFormulario reserva={reserva} onEnviado={() => actualizar({ formulario_enviado_at: ahora() })} />
          )}
        </li>
        {pasos.map((p) => (
          <li key={p.campo} className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {p.hecho ? "✓" : "○"} {p.etiqueta}
              {p.hecho && <span className="ml-2 text-xs text-ink/50">{fechaHora(p.hecho)}</span>}
            </span>
            {!cancelada && p.automatico ? (
              !p.hecho && <span className="text-xs text-ink/50">{p.automatico}</span>
            ) : !cancelada &&
              (p.hecho ? (
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => actualizar({ [p.campo]: null }, `¿Deshacer "${p.etiqueta}"?`)}
                  className="text-xs text-ink/50 underline hover:text-ink"
                >
                  Deshacer
                </button>
              ) : (
                <button
                  type="button"
                  disabled={guardando || p.disabled}
                  title={p.ayuda}
                  onClick={() => actualizar({ [p.campo]: ahora() })}
                  className="rounded-md border border-line px-2.5 py-1 text-xs text-ink/70 hover:text-ink disabled:opacity-40"
                >
                  {p.accion}
                </button>
              ))}
            {p.campo === "contrato_firmado_at" && !cancelada && <ContratoPdf reserva={reserva} onCambio={onCambio} />}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
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
    const porAlta = [...clientes].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return new Map(
      porAlta.map((c, i) => [
        c.id,
        { ...c, color: COLORES_CLIENTE[i % COLORES_CLIENTE.length] },
      ]),
    );
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
         estado, canal, importe_neto, importe_pendiente, piso_pendiente, fase,
         formulario_enviado_at, formulario_completado_at, contrato_enviado_at, contrato_firmado_at, checkin_at,
         num_huespedes, formulario_token, titular_huesped_id, contrato_generado_at, contrato_pdf_id, contrato_carpeta_id, contrato_firmado_pdf_id,
         apartamentos!inner(piso, cliente_id),
         origenes_reserva(nombre),
         formas_pago(descripcion),
         huespedes!huespedes_reserva_id_fkey(id, created_at, nombre, apellido1, apellido2, telefono, correo, fecha_nacimiento,
           soporte_documento, numero_documento, direccion, codigo_postal, nombre_municipio,
           tipo_documento_codigo, rol, sexo_codigo, parentesco_codigo, nacionalidad_codigo, pais_codigo,
           codigo_municipio_ref, motivo_viaje, nacionalidad:paises!huespedes_nacionalidad_codigo_fkey(nombre),
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
            const conPasos = accion && accion !== "importe" ? pasosAbiertos !== r.id : pasosAbiertos === r.id;
            const cliente = r.apartamentos?.cliente_id ? clientesPorId.get(r.apartamentos.cliente_id) : undefined;
            return (
              <div
                key={r.id}
                className={`relative overflow-hidden rounded-lg border border-line bg-white pl-1.5 before:absolute before:inset-y-0 before:left-0 before:w-1.5 ${
                  (cliente?.color ?? SIN_CLIENTE).franja
                } ${r.fase === "cancelada" ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <span
                    title={cliente?.nombre ?? "Sin cliente"}
                    className={`inline-flex h-9 w-11 shrink-0 items-center justify-center rounded-md text-xs font-bold tracking-wide ring-1 ring-inset ${
                      (cliente?.color ?? SIN_CLIENTE).etiqueta
                    }`}
                  >
                    {cliente?.codigo ?? cliente?.nombre?.slice(0, 2).toUpperCase() ?? "—"}
                  </span>
                  <div className="min-w-[180px]">
                    <div className="text-sm font-medium">
                      {formatoFecha(r.fecha_entrada)} → {formatoFecha(r.fecha_salida)}
                    </div>
                    <div className="text-xs text-ink/50">
                      {apartamento?.piso}
                    </div>
                  </div>
                  <div className="min-w-[160px]">
                    <div className="text-sm">
                      {r.nombre} {r.apellido1 ?? ""}
                    </div>
                    <div className="text-xs text-ink/50">{origen ?? "Sin origen"}</div>
                  </div>
                  <div className="flex min-w-0 flex-col items-start gap-1.5 text-sm">
                    {r.fase === "cancelada" ? (
                      <EtiquetaFase fase={r.fase} />
                    ) : (
                      <IndicadorPasos
                        reserva={r}
                        abierto={conPasos}
                        onAbrir={() => setPasosAbiertos(pasosAbiertos === r.id ? null : r.id)}
                      />
                    )}
                    {r.fase === "pendiente_importe" && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.piso_pendiente && <PisoPendiente reserva={r} onGuardado={cargar} />}
                        {r.importe_pendiente && <ImportePendiente reserva={r} onGuardado={cargar} />}
                      </div>
                    )}
                  </div>

                  <div className="ml-auto flex items-center gap-3 text-sm">
                    <button
                      type="button"
                      onClick={() => setExpandidaId(abierta ? null : r.id)}
                      className="text-ink/60 hover:text-ink"
                    >
                      {abierta ? "Ocultar huéspedes" : `Huéspedes (${r.huespedes?.length ?? 0})`}
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
                      <a
                        href={`/apartamentos/${r.apartamento_id}/reservas/${r.id}/huespedes/nuevo`}
                        className="mt-2 inline-block text-xs text-ink/60 underline hover:text-ink"
                      >
                        + Añadir huésped a mano
                      </a>
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
          <dl className="space-y-2">
          <FilaDetalle etiqueta="Piso" valor={detalleReserva.apartamentos?.piso} />
          <FilaDetalle etiqueta="Fecha de reserva" valor={formatoFecha(detalleReserva.fecha_reserva)} />
          <FilaDetalle etiqueta="Entrada" valor={formatoFecha(detalleReserva.fecha_entrada)} />
          <FilaDetalle etiqueta="Salida" valor={formatoFecha(detalleReserva.fecha_salida)} />
          <FilaDetalle etiqueta="Duración (noches)" valor={detalleReserva.duracion} />
          <FilaDetalle
            etiqueta="Titular"
            valor={`${detalleReserva.nombre} ${detalleReserva.apellido1 ?? ""} ${
              detalleReserva.apellido2 ?? ""
            }`}
          />
          <FilaDetalle etiqueta="Importe" valor={detalleReserva.importe != null ? `${detalleReserva.importe} €` : "—"} />
          <FilaDetalle
            etiqueta="Comisión portal"
            valor={detalleReserva.comision_portal != null ? `${detalleReserva.comision_portal} €` : "—"}
          />
          <FilaDetalle etiqueta="Código de reserva" valor={detalleReserva.codigo_reserva} />
          <FilaDetalle etiqueta="Teléfono" valor={detalleReserva.telefono} />
          <FilaDetalle etiqueta="Origen" valor={detalleReserva.origenes_reserva?.nombre} />
          <FilaDetalle etiqueta="Forma de pago" valor={detalleReserva.formas_pago?.descripcion} />
          <FilaDetalle etiqueta="Fecha de pago" valor={formatoFecha(detalleReserva.fecha_pago)} />
          <FilaDetalle etiqueta="Importe neto (portal)" valor={detalleReserva.importe_neto != null ? euros(detalleReserva.importe_neto) : null} />
          <FilaDetalle etiqueta="Estado" valor={<EtiquetaFase fase={detalleReserva.fase} />} />
          <FilaDetalle etiqueta="Canal" valor={detalleReserva.canal} />
          <FilaDetalle etiqueta="Contrato" valor={<EnlacesContrato reserva={detalleReserva} />} />
          </dl>
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
              onBorrado={() => {
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
            <MoverHuesped
              huesped={detalleHuesped}
              fechaRef={reservaDelHuesped.fecha_entrada}
              reservaId={reservaDelHuesped.id}
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
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  onEditar?: () => void;
  children: React.ReactNode;
}) {
  // Pulsar fuera cierra solo en modo consulta (al editar se perderían los cambios).
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4" onClick={onEditar ? onCerrar : undefined}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6"
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
