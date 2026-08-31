"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Apartamento = { id: string; apartamento: string; piso: string | null };
type Cliente = { id: string; nombre: string };

type Huesped = {
  id: string;
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
  paises: { nombre: string }[] | null;
  tipos_documento: { descripcion: string }[] | null;
  sexos: { descripcion: string }[] | null;
  parentescos: { descripcion: string }[] | null;
};

type Reserva = {
  id: string;
  apartamento_id: string;
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
  apartamentos: { apartamento: string; piso: string | null } [] | null;
  origenes_reserva: { nombre: string }[] | null;
  formas_pago: { descripcion: string }[] | null;
  huespedes: Huesped[] | null;
};

type Rango = "ultimos31" | "mesActual" | "personalizado";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function sumarDias(fechaISO: string, dias: number) {
  const d = new Date(fechaISO + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function primerDiaMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function ultimoDiaMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function formatoFecha(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function EntradasView({
  apartamentos,
  clientes,
}: {
  apartamentos: Apartamento[];
  clientes: Cliente[];
}) {
  const supabase = useMemo(() => createClient(), []);

  const [rango, setRango] = useState<Rango>("ultimos31");
  const [desde, setDesde] = useState(sumarDias(hoyISO(), -30));
  const [hasta, setHasta] = useState(hoyISO());

  const [apartamentoId, setApartamentoId] = useState("");
  const [piso, setPiso] = useState("");
  const [clienteId, setClienteId] = useState("");

  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [expandida, setExpandidaId] = useState<string | null>(null);
  const [detalleReserva, setDetalleReserva] = useState<Reserva | null>(null);
  const [detalleHuesped, setDetalleHuesped] = useState<Huesped | null>(null);

  const pisos = useMemo(
    () =>
      Array.from(new Set(apartamentos.map((a) => a.piso).filter(Boolean))) as string[],
    [apartamentos]
  );

  function elegirRango(r: Rango) {
    setRango(r);
    if (r === "ultimos31") {
      setDesde(sumarDias(hoyISO(), -30));
      setHasta(hoyISO());
    } else if (r === "mesActual") {
      setDesde(primerDiaMes());
      setHasta(ultimoDiaMes());
    }
  }

  async function cargar() {
    setCargando(true);
    setError("");

    let query = supabase
      .from("reservas")
      .select(
        `id, apartamento_id, fecha_reserva, fecha_entrada, fecha_salida, nombre, apellido1, apellido2,
         importe, comision_portal, codigo_reserva, telefono, fecha_pago, duracion,
         apartamentos!inner(apartamento, piso, cliente_id),
         origenes_reserva(nombre),
         formas_pago(descripcion),
         huespedes(id, nombre, apellido1, apellido2, telefono, correo, fecha_nacimiento,
           soporte_documento, numero_documento, direccion, codigo_postal, nombre_municipio,
           tipo_documento_codigo, rol, sexo_codigo, parentesco_codigo, paises(nombre),
           tipos_documento(descripcion), sexos(descripcion), parentescos(descripcion))`
      )
      .gte("fecha_entrada", desde)
      .lte("fecha_entrada", hasta)
      .order("fecha_entrada", { ascending: false });

    if (apartamentoId) query = query.eq("apartamento_id", apartamentoId);
    if (piso) query = query.eq("apartamentos.piso", piso);
    if (clienteId) query = query.eq("apartamentos.cliente_id", clienteId);

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
  }, [desde, hasta, apartamentoId, piso, clienteId]);

  return (
    <div>
      {/* Filtros */}
      <div className="rounded-lg border border-line bg-white p-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => elegirRango("ultimos31")}
            className={`rounded-md px-3 py-1.5 ${
              rango === "ultimos31" ? "bg-ink text-paper" : "border border-line text-ink/70"
            }`}
          >
            Últimos 31 días
          </button>
          <button
            type="button"
            onClick={() => elegirRango("mesActual")}
            className={`rounded-md px-3 py-1.5 ${
              rango === "mesActual" ? "bg-ink text-paper" : "border border-line text-ink/70"
            }`}
          >
            Mes en curso
          </button>
          <button
            type="button"
            onClick={() => setRango("personalizado")}
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
              <label htmlFor="desde">Desde</label>
              <input
                id="desde"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="hasta">Hasta</label>
              <input
                id="hasta"
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-3">
          <div>
            <label htmlFor="apartamento">Apartamento</label>
            <select
              id="apartamento"
              value={apartamentoId}
              onChange={(e) => setApartamentoId(e.target.value)}
            >
              <option value="">Todos</option>
              {apartamentos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.apartamento}
                  {a.piso ? ` · ${a.piso}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="piso">Piso</label>
            <select id="piso" value={piso} onChange={(e) => setPiso(e.target.value)}>
              <option value="">Todos</option>
              {pisos.map((p) => (
                <option key={p} value={p}>
                  {p}
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
        </div>
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
            const apartamento = r.apartamentos?.[0];
            const origen = r.origenes_reserva?.[0]?.nombre;
            const abierta = expandida === r.id;
            return (
              <div key={r.id} className="rounded-lg border border-line bg-white">
                <div className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <div className="min-w-[180px]">
                    <div className="text-sm font-medium">
                      {formatoFecha(r.fecha_entrada)} → {formatoFecha(r.fecha_salida)}
                    </div>
                    <div className="text-xs text-ink/50">
                      {apartamento?.apartamento}
                      {apartamento?.piso ? ` · ${apartamento.piso}` : ""}
                    </div>
                  </div>
                  <div className="min-w-[160px]">
                    <div className="text-sm">
                      {r.nombre} {r.apellido1 ?? ""}
                    </div>
                    <div className="text-xs text-ink/50">{origen ?? "Sin origen"}</div>
                  </div>
                  <div className="text-sm">
                    {r.importe != null ? `${r.importe} €` : "—"}
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
                            <div className="text-ink/60">{h.paises?.[0]?.nombre ?? "—"}</div>
                            <div className="text-ink/60">{h.telefono ?? "—"}</div>
                            <div className="text-ink/60">{h.correo ?? "—"}</div>
                            <button
                              type="button"
                              onClick={() => setDetalleHuesped(h)}
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
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {detalleReserva && (
        <ModalDetalle titulo="Detalle de la entrada" onCerrar={() => setDetalleReserva(null)}>
          <FilaDetalle etiqueta="Apartamento" valor={detalleReserva.apartamentos?.[0]?.apartamento} />
          <FilaDetalle etiqueta="Piso" valor={detalleReserva.apartamentos?.[0]?.piso} />
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
          <FilaDetalle etiqueta="Origen" valor={detalleReserva.origenes_reserva?.[0]?.nombre} />
          <FilaDetalle etiqueta="Forma de pago" valor={detalleReserva.formas_pago?.[0]?.descripcion} />
          <FilaDetalle etiqueta="Fecha de pago" valor={formatoFecha(detalleReserva.fecha_pago)} />
        </ModalDetalle>
      )}

      {detalleHuesped && (
        <ModalDetalle titulo="Detalle del huésped" onCerrar={() => setDetalleHuesped(null)}>
          <FilaDetalle
            etiqueta="Nombre completo"
            valor={`${detalleHuesped.nombre} ${detalleHuesped.apellido1 ?? ""} ${
              detalleHuesped.apellido2 ?? ""
            }`}
          />
          <FilaDetalle etiqueta="Nacionalidad" valor={detalleHuesped.paises?.[0]?.nombre} />
          <FilaDetalle etiqueta="Fecha de nacimiento" valor={formatoFecha(detalleHuesped.fecha_nacimiento)} />
          <FilaDetalle etiqueta="Tipo de documento" valor={detalleHuesped.tipos_documento?.[0]?.descripcion} />
          <FilaDetalle etiqueta="Nº documento" valor={detalleHuesped.numero_documento} />
          <FilaDetalle etiqueta="Soporte del documento" valor={detalleHuesped.soporte_documento} />
          <FilaDetalle etiqueta="Dirección" valor={detalleHuesped.direccion} />
          <FilaDetalle etiqueta="Código postal" valor={detalleHuesped.codigo_postal} />
          <FilaDetalle etiqueta="Municipio" valor={detalleHuesped.nombre_municipio} />
          <FilaDetalle etiqueta="Teléfono" valor={detalleHuesped.telefono} />
          <FilaDetalle etiqueta="Correo" valor={detalleHuesped.correo} />
          <FilaDetalle etiqueta="Rol" valor={detalleHuesped.rol} />
          <FilaDetalle etiqueta="Sexo" valor={detalleHuesped.sexos?.[0]?.descripcion} />
          <FilaDetalle etiqueta="Parentesco" valor={detalleHuesped.parentescos?.[0]?.descripcion} />
        </ModalDetalle>
      )}
    </div>
  );
}

function ModalDetalle({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{titulo}</h2>
          <button onClick={onCerrar} className="text-ink/50 hover:text-ink">
            Cerrar
          </button>
        </div>
        <dl className="mt-4 space-y-2 text-sm">{children}</dl>
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
