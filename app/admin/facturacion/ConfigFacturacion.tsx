"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Cliente = { id: string; codigo: string | null; nombre: string };
type Config = {
  emisor_nombre: string | null;
  emisor_nif: string | null;
  emisor_direccion: string | null;
  banco: string | null;
  iban: string | null;
  plantilla_asunto: string | null;
  plantilla_cuerpo: string | null;
};
type Serie = {
  id: string;
  cliente_id: string;
  codigo: string;
  nombre: string;
  destinatario_nombre: string | null;
  destinatario_nif: string | null;
  destinatario_direccion: string | null;
  checkin: "no" | "agrupado" | "detalle";
  limpieza: "no" | "agrupado" | "detalle";
  gestion: boolean;
  servicios: boolean;
  descontar_checkin: boolean;
  irpf_pct: number;
  iva_pct: number;
  concepto_libro: string | null;
  plantilla_gestion: string | null;
  activa: boolean;
};

const VARIABLES = ["{{numero}}", "{{periodo}}", "{{total}}", "{{destinatario}}", "{{cliente}}", "{{fecha}}"];

export default function ConfigFacturacion({ clientes }: { clientes: Cliente[] }) {
  return (
    <div className="space-y-8">
      <Emisor />
      <Series clientes={clientes} />
    </div>
  );
}

function Emisor() {
  const supabase = useMemo(() => createClient(), []);
  const [c, setC] = useState<Config | null>(null);
  const [estado, setEstado] = useState("");
  useEffect(() => {
    supabase
      .from("configuracion_facturacion")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => setC((data as Config) ?? { emisor_nombre: "", emisor_nif: "", emisor_direccion: "", banco: "", iban: "", plantilla_asunto: "", plantilla_cuerpo: "" }));
  }, [supabase]);
  if (!c) return <p className="text-sm text-ink/40">Cargando…</p>;
  const set = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setC({ ...c, [k]: e.target.value });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("Guardando…");
    const { error } = await supabase.from("configuracion_facturacion").upsert({ id: 1, ...c, updated_at: new Date().toISOString() });
    setEstado(error ? error.message : "Guardado");
  }

  return (
    <form onSubmit={guardar} className="rounded-lg border border-line bg-white p-4">
      <h2 className="text-sm font-semibold">Emisor y plantilla del correo</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label>Nombre del emisor</label>
          <input value={c.emisor_nombre ?? ""} onChange={set("emisor_nombre")} />
        </div>
        <div>
          <label>NIF</label>
          <input value={c.emisor_nif ?? ""} onChange={set("emisor_nif")} />
        </div>
        <div className="sm:col-span-2">
          <label>Dirección</label>
          <input value={c.emisor_direccion ?? ""} onChange={set("emisor_direccion")} />
        </div>
        <div>
          <label>Banco</label>
          <input value={c.banco ?? ""} onChange={set("banco")} />
        </div>
        <div>
          <label>IBAN</label>
          <input value={c.iban ?? ""} onChange={set("iban")} />
        </div>
        <div className="sm:col-span-2">
          <label>Asunto del email</label>
          <input value={c.plantilla_asunto ?? ""} onChange={set("plantilla_asunto")} />
        </div>
        <div className="sm:col-span-2">
          <label>Cuerpo del email</label>
          <textarea rows={7} value={c.plantilla_cuerpo ?? ""} onChange={set("plantilla_cuerpo")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
          <p className="mt-1 text-xs text-ink/50">Puedes usar: {VARIABLES.join(" · ")}. El PDF de la factura (con el detalle de reservas) va adjunto.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-3">
        {estado && <span className={`text-xs ${estado === "Guardado" ? "text-emerald-700" : "text-ink/60"}`}>{estado}</span>}
        <button type="submit" className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-paper">
          Guardar
        </button>
      </div>
    </form>
  );
}

const MODOS = { no: "No incluir", agrupado: "Agrupado (nº × precio)", detalle: "Una línea por reserva" };

function Series({ clientes }: { clientes: Cliente[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [series, setSeries] = useState<Serie[] | null>(null);
  const [editando, setEditando] = useState<Serie | "nueva" | null>(null);
  async function cargar() {
    const { data } = await supabase.from("series_facturacion").select("*").order("codigo");
    setSeries((data as Serie[]) ?? []);
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cli = (id: string) => clientes.find((c) => c.id === id);

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Facturas mensuales por cliente (series)</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-ink/50">
            Cada serie es una factura que se genera cada mes con las líneas de Ingresos del cliente. El número es AAMM + código
            (p. ej. 261004).
          </p>
        </div>
        <button type="button" onClick={() => setEditando("nueva")} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper">
          + Nueva serie
        </button>
      </div>
      {series === null ? (
        <p className="mt-3 text-sm text-ink/40">Cargando…</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {series.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setEditando(s)}
                className={`w-full rounded-lg border border-line bg-white px-4 py-3 text-left hover:bg-paper ${s.activa ? "" : "opacity-60"}`}
              >
                <p className="text-sm font-medium">
                  {s.codigo} · {s.nombre}
                  <span className="ml-2 text-xs font-normal text-ink/50">{cli(s.cliente_id)?.codigo}</span>
                  {!s.activa && <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-xs">Inactiva</span>}
                </p>
                <p className="mt-0.5 text-xs text-ink/60">
                  {s.destinatario_nombre} ·{" "}
                  {[
                    s.checkin !== "no" && `Check-in ${s.checkin}`,
                    s.gestion && "Gestión",
                    s.limpieza !== "no" && `Limpieza ${s.limpieza}`,
                    s.servicios && "Servicios",
                  ]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  · IRPF {Number(s.irpf_pct)}% · IVA {Number(s.iva_pct)}%
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editando && (
        <EditarSerie
          serie={editando === "nueva" ? null : editando}
          clientes={clientes}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </section>
  );
}

function EditarSerie({ serie, clientes, onCerrar, onGuardado }: { serie: Serie | null; clientes: Cliente[]; onCerrar: () => void; onGuardado: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [s, setS] = useState({
    cliente_id: serie?.cliente_id ?? clientes[0]?.id ?? "",
    codigo: serie?.codigo ?? "",
    nombre: serie?.nombre ?? "",
    destinatario_nombre: serie?.destinatario_nombre ?? "",
    destinatario_nif: serie?.destinatario_nif ?? "",
    destinatario_direccion: serie?.destinatario_direccion ?? "",
    checkin: serie?.checkin ?? "no",
    limpieza: serie?.limpieza ?? "no",
    gestion: serie?.gestion ?? false,
    servicios: serie?.servicios ?? false,
    descontar_checkin: serie?.descontar_checkin ?? false,
    irpf_pct: String(serie?.irpf_pct ?? 0),
    iva_pct: String(serie?.iva_pct ?? 21),
    concepto_libro: serie?.concepto_libro ?? "",
    plantilla_gestion: serie?.plantilla_gestion ?? "",
    activa: serie?.activa ?? true,
  });
  const [error, setError] = useState("");
  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setS({ ...s, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{2}$/.test(s.codigo)) return setError("El código son dos cifras (p. ej. 04).");
    if (!s.nombre.trim()) return setError("Pon un nombre a la serie.");
    const valores = {
      ...s,
      irpf_pct: Number(s.irpf_pct.replace(",", ".")) || 0,
      iva_pct: Number(s.iva_pct.replace(",", ".")) || 0,
      concepto_libro: s.concepto_libro.trim() || null,
      plantilla_gestion: s.plantilla_gestion.trim() || null,
    };
    const { error: err } = serie
      ? await supabase.from("series_facturacion").update(valores).eq("id", serie.id)
      : await supabase.from("series_facturacion").insert(valores);
    if (err) return setError(err.message.includes("duplicate") ? "Ya hay una serie con ese código." : err.message);
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:px-4">
      <form onSubmit={guardar} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-lg sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{serie ? "Editar serie" : "Nueva serie de facturación"}</h2>
          <button type="button" onClick={onCerrar} className="text-sm text-ink/50 hover:text-ink">
            Cerrar
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label>Cliente</label>
            <select value={s.cliente_id} onChange={set("cliente_id")}>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo ? `${c.codigo} · ` : ""}
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-[5rem_1fr] gap-3">
            <div>
              <label>Código</label>
              <input value={s.codigo} onChange={set("codigo")} maxLength={2} inputMode="numeric" />
            </div>
            <div>
              <label>Nombre</label>
              <input value={s.nombre} onChange={set("nombre")} />
            </div>
          </div>
          <div>
            <label>Destinatario de la factura</label>
            <input value={s.destinatario_nombre} onChange={set("destinatario_nombre")} />
          </div>
          <div>
            <label>CIF/NIF/NIE</label>
            <input value={s.destinatario_nif} onChange={set("destinatario_nif")} />
          </div>
          <div className="sm:col-span-2">
            <label>Dirección</label>
            <input value={s.destinatario_direccion} onChange={set("destinatario_direccion")} />
          </div>
          <div>
            <label>Check-in</label>
            <select value={s.checkin} onChange={set("checkin")}>
              {Object.entries(MODOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Limpieza (importe neto)</label>
            <select value={s.limpieza} onChange={set("limpieza")}>
              {Object.entries(MODOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.gestion} onChange={set("gestion")} className="h-4 w-4" /> Incluir las líneas de Gestión
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.servicios} onChange={set("servicios")} className="h-4 w-4" /> Incluir Servicios (reparaciones, extras)
          </label>
          <div>
            <label>% IRPF</label>
            <input inputMode="decimal" value={s.irpf_pct} onChange={set("irpf_pct")} />
          </div>
          <div>
            <label>% IVA</label>
            <input inputMode="decimal" value={s.iva_pct} onChange={set("iva_pct")} />
          </div>
          <div className="sm:col-span-2">
            <label>Texto de la línea de gestión (opcional)</label>
            <textarea
              rows={2}
              value={s.plantilla_gestion}
              onChange={(e) => setS({ ...s, plantilla_gestion: e.target.value })}
              placeholder={"El Botones Barco {{pct}}% facturacion {{base}}\nFacturacion (Sin comisiones portales)"}
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
            />
            <p className="mt-0.5 text-xs text-ink/50">
              {"{{pct}}"} = % de la regla de gestión, {"{{base}}"} = facturación sobre la que se aplica. Si se deja vacío se usa el
              nombre de la línea de Gestión (p. ej. “Octubre”).
            </p>
          </div>
          <div className="sm:col-span-2">
            <label>Concepto en el libro de facturas</label>
            <input value={s.concepto_libro} onChange={set("concepto_libro")} placeholder="p. ej. Facturacion Barco" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.activa} onChange={set("activa")} className="h-4 w-4" /> Activa (se genera cada mes)
          </label>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-3">
          {error && <span className="mr-auto text-xs text-clay">{error}</span>}
          <button type="button" onClick={onCerrar} className="text-sm text-ink/60 hover:text-ink">
            Cancelar
          </button>
          <button type="submit" className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper">
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
