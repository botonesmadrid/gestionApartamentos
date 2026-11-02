"use client";

// Edición de una entrada (reserva) y de sus huéspedes desde el listado de Entradas.
// Escribe directamente en Supabase con la sesión del gestor (RLS).

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Opcion = { valor: string; etiqueta: string };

// ---------------------------------------------------------------------------
// Piezas de formulario

function Fila({ etiqueta, children, ayuda }: { etiqueta: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-line pb-2 sm:grid-cols-[11rem_1fr] sm:items-center sm:gap-3">
      <span className="text-sm text-ink/50">{etiqueta}</span>
      <div>
        {children}
        {ayuda && <p className="mt-0.5 text-xs text-ink/40">{ayuda}</p>}
      </div>
    </div>
  );
}

function Texto({ valor, onChange, tipo = "text" }: { valor: string; onChange: (v: string) => void; tipo?: string }) {
  return <input type={tipo} className="!py-1.5" value={valor} onChange={(e) => onChange(e.target.value)} />;
}

function Desplegable({
  valor,
  opciones,
  onChange,
  vacio = "—",
}: {
  valor: string;
  opciones: Opcion[];
  onChange: (v: string) => void;
  vacio?: string;
}) {
  return (
    <select className="!py-1.5" value={valor} onChange={(e) => onChange(e.target.value)}>
      <option value="">{vacio}</option>
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  );
}

function Botonera({
  guardando,
  error,
  onCancelar,
}: {
  guardando: boolean;
  error: string;
  onCancelar: () => void;
}) {
  return (
    <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 flex items-center justify-end gap-3 border-t border-line bg-white px-6 py-3">
      {error && <span className="mr-auto text-xs text-clay">{error}</span>}
      <button type="button" onClick={onCancelar} className="text-sm text-ink/60 hover:text-ink">
        Cancelar
      </button>
      <button
        type="submit"
        disabled={guardando}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Guardar cambios"}
      </button>
    </div>
  );
}

const nulo = (v: string) => (v.trim() === "" ? null : v.trim());
const numero = (v: string) => {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

// Carga una tabla de catálogo como opciones (con la sesión del gestor).
function useCatalogo(tabla: string, valor: string, etiqueta: string) {
  const supabase = useMemo(() => createClient(), []);
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  useEffect(() => {
    supabase
      .from(tabla)
      .select(`${valor}, ${etiqueta}`)
      .order(etiqueta)
      .then(({ data }) =>
        setOpciones(((data ?? []) as any[]).map((d) => ({ valor: d[valor], etiqueta: d[etiqueta] }))),
      );
  }, [supabase, tabla, valor, etiqueta]);
  return opciones;
}

// ---------------------------------------------------------------------------
// Reserva

export type ReservaEditable = {
  id: string;
  apartamento_id: string;
  fecha_reserva: string | null;
  fecha_entrada: string;
  fecha_salida: string;
  nombre: string;
  apellido1: string | null;
  apellido2: string | null;
  importe: number | null;
  importe_neto: number | null;
  comision_portal: number | null;
  importe_pendiente: boolean;
  codigo_reserva: string | null;
  telefono: string | null;
  origen_codigo: string | null;
  forma_pago_codigo: string | null;
  fecha_pago: string | null;
  num_huespedes: number | null;
};

export function EditarReserva({
  reserva,
  apartamentos,
  onGuardado,
  onCancelar,
}: {
  reserva: ReservaEditable;
  apartamentos: { id: string; piso: string }[];
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const origenes = useCatalogo("origenes_reserva", "codigo", "nombre");
  const formasPago = useCatalogo("formas_pago", "codigo", "descripcion");

  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const [f, setF] = useState({
    apartamento_id: reserva.apartamento_id,
    fecha_reserva: str(reserva.fecha_reserva),
    fecha_entrada: reserva.fecha_entrada,
    fecha_salida: reserva.fecha_salida,
    nombre: reserva.nombre,
    apellido1: str(reserva.apellido1),
    apellido2: str(reserva.apellido2),
    importe: str(reserva.importe),
    importe_neto: str(reserva.importe_neto),
    comision_portal: str(reserva.comision_portal),
    codigo_reserva: str(reserva.codigo_reserva),
    telefono: str(reserva.telefono),
    origen_codigo: str(reserva.origen_codigo),
    forma_pago_codigo: str(reserva.forma_pago_codigo),
    fecha_pago: str(reserva.fecha_pago),
    num_huespedes: str(reserva.num_huespedes),
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  // Con neto informado, la comisión la calcula la base de datos (importe − neto).
  const imp = numero(f.importe);
  const neto = numero(f.importe_neto);
  const comisionCalculada = imp != null && neto != null && !isNaN(imp) && !isNaN(neto) ? imp - neto : null;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!f.nombre.trim()) return setError("El titular es obligatorio.");
    if (!f.fecha_entrada || !f.fecha_salida) return setError("Las fechas de entrada y salida son obligatorias.");
    if (f.fecha_salida < f.fecha_entrada) return setError("La salida no puede ser anterior a la entrada.");
    const importe = numero(f.importe);
    const importe_neto = numero(f.importe_neto);
    const comision = numero(f.comision_portal);
    const n = numero(f.num_huespedes);
    if ([importe, importe_neto, comision, n].some((x) => x !== null && isNaN(x as number))) {
      return setError("Revisa los importes y el nº de huéspedes: deben ser números.");
    }
    if (n !== null && (!Number.isInteger(n) || n < 1)) return setError("El nº de huéspedes debe ser un entero mayor que 0.");

    const cambios: Record<string, unknown> = {
      apartamento_id: f.apartamento_id,
      fecha_reserva: nulo(f.fecha_reserva),
      fecha_entrada: f.fecha_entrada,
      fecha_salida: f.fecha_salida,
      nombre: f.nombre.trim(),
      apellido1: nulo(f.apellido1),
      apellido2: nulo(f.apellido2),
      importe,
      importe_neto,
      codigo_reserva: nulo(f.codigo_reserva),
      telefono: nulo(f.telefono),
      origen_codigo: nulo(f.origen_codigo),
      forma_pago_codigo: nulo(f.forma_pago_codigo),
      fecha_pago: nulo(f.fecha_pago),
      num_huespedes: n,
    };
    if (importe_neto === null) cambios.comision_portal = comision; // sin neto, la comisión se escribe a mano
    if (importe !== null) cambios.importe_pendiente = false; // con importe, ya no queda pendiente

    setGuardando(true);
    // Sin id: alta manual de una entrada (p. ej. reservas confirmadas fuera de Avirato).
    const { error: err } = reserva.id
      ? await supabase.from("reservas").update(cambios).eq("id", reserva.id)
      : await supabase.from("reservas").insert({
          ...cambios,
          comision_portal: cambios.comision_portal ?? (importe_neto === null ? comision : null),
          importe_pendiente: importe === null,
          estado: "confirmada",
          canal: "manual",
        });
    setGuardando(false);
    if (err) return setError(err.message);
    window.dispatchEvent(new Event("pendientes-cambiados"));
    onGuardado();
  }

  return (
    <form onSubmit={guardar} className="space-y-2 text-sm">
      <Fila etiqueta="Piso">
        <Desplegable
          valor={f.apartamento_id}
          opciones={apartamentos.map((a) => ({ valor: a.id, etiqueta: a.piso }))}
          onChange={set("apartamento_id")}
        />
      </Fila>
      <Fila etiqueta="Entrada">
        <Texto tipo="date" valor={f.fecha_entrada} onChange={set("fecha_entrada")} />
      </Fila>
      <Fila etiqueta="Salida">
        <Texto tipo="date" valor={f.fecha_salida} onChange={set("fecha_salida")} />
      </Fila>
      <Fila etiqueta="Fecha de reserva">
        <Texto tipo="date" valor={f.fecha_reserva} onChange={set("fecha_reserva")} />
      </Fila>
      <Fila etiqueta="Titular (nombre)">
        <Texto valor={f.nombre} onChange={set("nombre")} />
      </Fila>
      <Fila etiqueta="Primer apellido">
        <Texto valor={f.apellido1} onChange={set("apellido1")} />
      </Fila>
      <Fila etiqueta="Segundo apellido">
        <Texto valor={f.apellido2} onChange={set("apellido2")} />
      </Fila>
      <Fila etiqueta="Teléfono">
        <Texto tipo="tel" valor={f.telefono} onChange={set("telefono")} />
      </Fila>
      <Fila etiqueta="Nº de huéspedes" ayuda="Adultos + niños. Decide cuándo se completa el formulario.">
        <Texto tipo="number" valor={f.num_huespedes} onChange={set("num_huespedes")} />
      </Fila>
      <Fila etiqueta="Código de reserva">
        <Texto valor={f.codigo_reserva} onChange={set("codigo_reserva")} />
      </Fila>
      <Fila etiqueta="Origen">
        <Desplegable valor={f.origen_codigo} opciones={origenes} onChange={set("origen_codigo")} />
      </Fila>
      <Fila etiqueta="Importe con comisión">
        <Texto valor={f.importe} onChange={set("importe")} />
      </Fila>
      <Fila etiqueta="Importe neto (portal)">
        <Texto valor={f.importe_neto} onChange={set("importe_neto")} />
      </Fila>
      <Fila
        etiqueta="Comisión portal"
        ayuda={neto != null && !isNaN(neto) ? "Se calcula sola: importe con comisión − neto." : undefined}
      >
        {neto != null && !isNaN(neto) ? (
          <span className="font-medium">
            {comisionCalculada != null ? `${comisionCalculada.toFixed(2)} €` : "—"}
          </span>
        ) : (
          <Texto valor={f.comision_portal} onChange={set("comision_portal")} />
        )}
      </Fila>
      <Fila etiqueta="Forma de pago">
        <Desplegable valor={f.forma_pago_codigo} opciones={formasPago} onChange={set("forma_pago_codigo")} />
      </Fila>
      <Fila etiqueta="Fecha de pago">
        <Texto tipo="date" valor={f.fecha_pago} onChange={set("fecha_pago")} />
      </Fila>
      <Botonera guardando={guardando} error={error} onCancelar={onCancelar} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Huésped

export type HuespedEditable = {
  id: string;
  nombre: string;
  apellido1: string | null;
  apellido2: string | null;
  sexo_codigo: string | null;
  fecha_nacimiento: string | null;
  tipo_documento_codigo: string | null;
  numero_documento: string | null;
  soporte_documento: string | null;
  nacionalidad_codigo: string | null;
  direccion: string | null;
  codigo_postal: string | null;
  pais_codigo: string | null;
  codigo_municipio_ref: string | null;
  nombre_municipio: string | null;
  parentesco_codigo: string | null;
  telefono: string | null;
  correo: string | null;
  motivo_viaje: string | null;
};

export function EditarHuesped({
  huesped,
  onGuardado,
  onCancelar,
  onBorrado,
}: {
  huesped: HuespedEditable;
  onGuardado: () => void;
  onCancelar: () => void;
  onBorrado: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const paises = useCatalogo("paises", "codigo", "nombre");
  const tipos = useCatalogo("tipos_documento", "codigo", "descripcion");
  const sexos = useCatalogo("sexos", "codigo", "descripcion");
  const parentescos = useCatalogo("parentescos", "codigo", "descripcion");

  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const [f, setF] = useState({
    nombre: huesped.nombre,
    apellido1: str(huesped.apellido1),
    apellido2: str(huesped.apellido2),
    sexo_codigo: str(huesped.sexo_codigo),
    fecha_nacimiento: str(huesped.fecha_nacimiento),
    tipo_documento_codigo: str(huesped.tipo_documento_codigo),
    numero_documento: str(huesped.numero_documento),
    soporte_documento: str(huesped.soporte_documento),
    nacionalidad_codigo: str(huesped.nacionalidad_codigo),
    direccion: str(huesped.direccion),
    codigo_postal: str(huesped.codigo_postal),
    pais_codigo: str(huesped.pais_codigo),
    codigo_municipio_ref: str(huesped.codigo_municipio_ref),
    nombre_municipio: str(huesped.nombre_municipio),
    parentesco_codigo: str(huesped.parentesco_codigo),
    telefono: str(huesped.telefono),
    correo: str(huesped.correo),
    motivo_viaje: str(huesped.motivo_viaje),
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!f.nombre.trim()) return setError("El nombre es obligatorio.");
    const espana = f.pais_codigo === "ESP";
    const cambios = {
      nombre: f.nombre.trim(),
      apellido1: nulo(f.apellido1),
      apellido2: nulo(f.apellido2),
      sexo_codigo: nulo(f.sexo_codigo),
      fecha_nacimiento: nulo(f.fecha_nacimiento),
      tipo_documento_codigo: nulo(f.tipo_documento_codigo),
      numero_documento: nulo(f.numero_documento.toUpperCase().replace(/[\s-]/g, "")),
      soporte_documento: nulo(f.soporte_documento.toUpperCase()),
      nacionalidad_codigo: nulo(f.nacionalidad_codigo),
      direccion: nulo(f.direccion),
      codigo_postal: nulo(f.codigo_postal),
      pais_codigo: nulo(f.pais_codigo),
      codigo_municipio_ref: espana ? nulo(f.codigo_municipio_ref) : null,
      nombre_municipio: nulo(f.nombre_municipio),
      parentesco_codigo: nulo(f.parentesco_codigo),
      telefono: nulo(f.telefono),
      correo: nulo(f.correo.toLowerCase()),
      motivo_viaje: nulo(f.motivo_viaje),
    };
    setGuardando(true);
    const { error: err } = await supabase.from("huespedes").update(cambios).eq("id", huesped.id);
    setGuardando(false);
    if (err) return setError(err.message);
    onGuardado();
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar a ${huesped.nombre}? Se elimina el registro del huésped.`)) return;
    setGuardando(true);
    const { error: err } = await supabase.from("huespedes").delete().eq("id", huesped.id);
    setGuardando(false);
    if (err) return setError(err.message);
    onBorrado();
  }

  return (
    <form onSubmit={guardar} className="space-y-2 text-sm">
      <Fila etiqueta="Nombre">
        <Texto valor={f.nombre} onChange={set("nombre")} />
      </Fila>
      <Fila etiqueta="Primer apellido">
        <Texto valor={f.apellido1} onChange={set("apellido1")} />
      </Fila>
      <Fila etiqueta="Segundo apellido">
        <Texto valor={f.apellido2} onChange={set("apellido2")} />
      </Fila>
      <Fila etiqueta="Sexo">
        <Desplegable valor={f.sexo_codigo} opciones={sexos} onChange={set("sexo_codigo")} />
      </Fila>
      <Fila etiqueta="Fecha de nacimiento">
        <Texto tipo="date" valor={f.fecha_nacimiento} onChange={set("fecha_nacimiento")} />
      </Fila>
      <Fila etiqueta="Nacionalidad">
        <Desplegable valor={f.nacionalidad_codigo} opciones={paises} onChange={set("nacionalidad_codigo")} />
      </Fila>
      <Fila etiqueta="Tipo de documento">
        <Desplegable valor={f.tipo_documento_codigo} opciones={tipos} onChange={set("tipo_documento_codigo")} />
      </Fila>
      <Fila etiqueta="Nº documento">
        <Texto valor={f.numero_documento} onChange={set("numero_documento")} />
      </Fila>
      <Fila etiqueta="Soporte del documento" ayuda="Obligatorio para DNI y NIE.">
        <Texto valor={f.soporte_documento} onChange={set("soporte_documento")} />
      </Fila>
      <Fila etiqueta="País de residencia">
        <Desplegable valor={f.pais_codigo} opciones={paises} onChange={set("pais_codigo")} />
      </Fila>
      <Fila etiqueta="Dirección">
        <Texto valor={f.direccion} onChange={set("direccion")} />
      </Fila>
      <Fila etiqueta="Código postal">
        <Texto valor={f.codigo_postal} onChange={set("codigo_postal")} />
      </Fila>
      {f.pais_codigo === "ESP" ? (
        <Fila etiqueta="Municipio">
          <BuscadorMunicipio
            nombre={f.nombre_municipio}
            onElegir={(codigo, nombre) => setF((p) => ({ ...p, codigo_municipio_ref: codigo, nombre_municipio: nombre }))}
          />
        </Fila>
      ) : (
        <Fila etiqueta="Ciudad">
          <Texto valor={f.nombre_municipio} onChange={set("nombre_municipio")} />
        </Fila>
      )}
      <Fila etiqueta="Parentesco con el titular">
        <Desplegable valor={f.parentesco_codigo} opciones={parentescos} onChange={set("parentesco_codigo")} />
      </Fila>
      <Fila etiqueta="Teléfono">
        <Texto tipo="tel" valor={f.telefono} onChange={set("telefono")} />
      </Fila>
      <Fila etiqueta="Correo">
        <Texto tipo="email" valor={f.correo} onChange={set("correo")} />
      </Fila>
      <Fila etiqueta="Motivo del viaje">
        <Texto valor={f.motivo_viaje} onChange={set("motivo_viaje")} />
      </Fila>
      <div className="pt-2">
        <button type="button" onClick={borrar} disabled={guardando} className="text-xs text-clay underline">
          Borrar huésped
        </button>
      </div>
      <Botonera guardando={guardando} error={error} onCancelar={onCancelar} />
    </form>
  );
}

function BuscadorMunicipio({ nombre, onElegir }: { nombre: string; onElegir: (codigo: string, nombre: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState(nombre);
  const [res, setRes] = useState<{ codigo: string; nombre: string }[]>([]);

  useEffect(() => {
    if (q.trim().length < 2 || q === nombre) return setRes([]);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("municipios")
        .select("codigo, nombre")
        .ilike("nombre", `%${q.trim().replace(/[%_]/g, "")}%`)
        .neq("codigo", "NOESP")
        .order("nombre")
        .limit(15);
      setRes((data as any[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, nombre, supabase]);

  return (
    <div className="relative">
      <input className="!py-1.5" value={q} placeholder="Buscar municipio…" onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-white shadow-lg">
          {res.map((m) => (
            <li key={m.codigo}>
              <button
                type="button"
                onClick={() => {
                  onElegir(m.codigo, m.nombre);
                  setQ(m.nombre);
                  setRes([]);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper"
              >
                {m.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
