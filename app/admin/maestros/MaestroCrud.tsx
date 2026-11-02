"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MaestroConfig } from "./config";

type Fila = Record<string, any>;
type Opciones = Record<string, { valor: string; etiqueta: string }[]>;

// Enlaces de Google Drive/Docs a partir del ID guardado.
function urlDrive(tipo: "carpeta" | "documento", id: string) {
  return tipo === "carpeta"
    ? `https://drive.google.com/drive/folders/${id}`
    : `https://docs.google.com/document/d/${id}/edit`;
}
// Si se pega un enlace completo de Drive/Docs, se guarda solo el ID.
function idDesdeEnlace(v: string) {
  const m = v.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ?? v.match(/\/d\/([A-Za-z0-9_-]{10,})/) ?? v.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : v.trim();
}
function EnlaceDrive({ tipo, id }: { tipo: "carpeta" | "documento"; id: string }) {
  return (
    <a
      href={urlDrive(tipo, id)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs text-ink/70 hover:text-ink"
      title={id}
    >
      {tipo === "carpeta" ? "Abrir carpeta" : "Abrir plantilla"} ↗
    </a>
  );
}

// Campos numéricos: aceptan coma decimal ("24,40"); vacío = sin valor.
function valorParaGuardar(tipo: string, v: any) {
  // Sí/No: vacío (alta nueva sin tocar) = valor por defecto de la base de datos.
  if (tipo === "sino") return v === "" || v === null || v === undefined ? undefined : v === true || v === "true";
  if (v === "" || v === undefined || v === null) return null;
  if (tipo === "numero") {
    const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : v; // si no es un número, que lo rechace la base de datos con su mensaje
  }
  return v;
}

function filaVacia(config: MaestroConfig): Fila {
  const fila: Fila = {};
  for (const campo of config.campos) fila[campo.key] = "";
  return fila;
}

export default function MaestroCrud({ config }: { config: MaestroConfig }) {
  const supabase = useMemo(() => createClient(), []);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [opciones, setOpciones] = useState<Opciones>({});
  const [cargando, setCargando] = useState(!config.requiereBusqueda);
  const [busqueda, setBusqueda] = useState("");
  const [editandoPk, setEditandoPk] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Fila>({});
  const [creando, setCreando] = useState(false);
  const [nuevaFila, setNuevaFila] = useState<Fila>(filaVacia(config));
  const [error, setError] = useState("");

  // Carga las opciones de los campos "select" una sola vez
  useEffect(() => {
    async function cargarOpciones() {
      const camposSelect = config.campos.filter((c) => c.tipo === "select" && c.select);
      const nuevas: Opciones = {};
      for (const campo of camposSelect) {
        const { data } = await supabase
          .from(campo.select!.tabla)
          .select(`${campo.select!.valor}, ${campo.select!.etiqueta}`)
          .order(campo.select!.etiqueta as string);
        nuevas[campo.key] = (data ?? []).map((d: any) => ({
          valor: d[campo.select!.valor],
          etiqueta: d[campo.select!.etiqueta],
        }));
      }
      setOpciones(nuevas);
    }
    cargarOpciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.slug]);

  async function cargarFilas(termino?: string) {
    setCargando(true);
    setError("");
    let query = supabase.from(config.tabla).select("*").order(config.ordenarPor);

    if (config.requiereBusqueda) {
      if (!termino || termino.trim().length < 2) {
        setFilas([]);
        setCargando(false);
        return;
      }
      query = query.or(`nombre.ilike.%${termino}%,codigo.ilike.%${termino}%`).limit(100);
    } else if (termino && termino.trim()) {
      const orConditions = config.campos
        .filter((c) => c.tipo === "text")
        .map((c) => `${c.key}.ilike.%${termino}%`)
        .join(",");
      if (orConditions) query = query.or(orConditions);
    }

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
    } else {
      setFilas(data ?? []);
    }
    setCargando(false);
  }

  useEffect(() => {
    if (!config.requiereBusqueda) cargarFilas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.slug]);

  function etiquetaDe(campoKey: string, valor: any) {
    const opts = opciones[campoKey];
    if (!opts) return valor ?? "";
    return opts.find((o) => o.valor === valor)?.etiqueta ?? valor ?? "";
  }

  function empezarEdicion(fila: Fila) {
    setEditandoPk(fila[config.pk]);
    setBorrador({ ...fila });
    setError("");
  }

  function cancelarEdicion() {
    setEditandoPk(null);
    setBorrador({});
  }

  async function guardarEdicion() {
    setError("");
    const cambios: Fila = {};
    for (const campo of config.campos) cambios[campo.key] = valorParaGuardar(campo.tipo, borrador[campo.key]);

    const { error: err } = await supabase
      .from(config.tabla)
      .update(cambios)
      .eq(config.pk, editandoPk);

    if (err) {
      setError(err.message);
      return;
    }
    setFilas((prev) =>
      prev.map((f) => (f[config.pk] === editandoPk ? { ...f, ...cambios } : f))
    );
    cancelarEdicion();
  }

  async function crearFila(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const faltante = config.campos.find((c) => c.requerido && !nuevaFila[c.key]);
    if (faltante) {
      setError(`El campo "${faltante.etiqueta}" es obligatorio.`);
      return;
    }

    const insertar: Fila = {};
    for (const campo of config.campos) insertar[campo.key] = valorParaGuardar(campo.tipo, nuevaFila[campo.key]);

    if (config.campoAutoUsuario) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      insertar[config.campoAutoUsuario] = user?.id;
    }

    const { data, error: err } = await supabase
      .from(config.tabla)
      .insert(insertar)
      .select()
      .single();

    if (err) {
      setError(err.message);
      return;
    }
    setFilas((prev) => [...prev, data]);
    setNuevaFila(filaVacia(config));
    setCreando(false);
  }

  function renderCampoInput(
    campoKey: string,
    valor: any,
    onChange: (v: string) => void,
    disabled?: boolean
  ) {
    const campo = config.campos.find((c) => c.key === campoKey)!;
    if (campo.tipo === "select") {
      return (
        <select value={valor ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">—</option>
          {(opciones[campoKey] ?? []).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      );
    }
    if (campo.tipo === "sino") {
      return (
        <select value={valor === "" || valor == null ? "" : String(valor)} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">Por defecto</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (campo.tipo === "numero") {
      return (
        <input
          inputMode="decimal"
          value={valor ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );
    }
    if (campo.enlace) {
      return (
        <div className="flex items-center gap-2">
          <input
            value={valor ?? ""}
            placeholder="Pega el enlace o el ID de Google Drive"
            onChange={(e) => onChange(idDesdeEnlace(e.target.value))}
            disabled={disabled}
          />
          {valor ? <EnlaceDrive tipo={campo.enlace} id={valor} /> : null}
        </div>
      );
    }
    return (
      <input
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    );
  }

  const columnas = config.campos.filter((c) => c.enLista !== false);
  const filaEditando = editandoPk ? filas.find((f) => f[config.pk] === editandoPk) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder={
            config.requiereBusqueda ? "Escribe para buscar (mín. 2 letras)…" : "Buscar…"
          }
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            cargarFilas(e.target.value);
          }}
          className="sm:max-w-xs"
        />
        <button
          type="button"
          onClick={() => setCreando((v) => !v)}
          className="ml-auto rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/90"
        >
          {creando ? "Cancelar" : "+ Añadir nuevo"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-clay">{error}</p>}

      {creando && (
        <form
          onSubmit={crearFila}
          className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-3"
        >
          {config.campos.map((campo) => (
            <div key={campo.key}>
              <label>
                {campo.etiqueta}
                {campo.requerido ? " *" : ""}
              </label>
              {renderCampoInput(campo.key, nuevaFila[campo.key], (v) =>
                setNuevaFila((prev) => ({ ...prev, [campo.key]: v }))
              )}
            </div>
          ))}
          <div className="col-span-full">
            <button
              type="submit"
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90"
            >
              Guardar
            </button>
          </div>
        </form>
      )}

      {filaEditando && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardarEdicion();
          }}
          className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-ink/20 bg-white p-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          <p className="col-span-full text-sm font-medium">Editar</p>
          {config.campos.map((campo) => (
            <div key={campo.key}>
              <label>
                {campo.etiqueta}
                {campo.requerido ? " *" : ""}
              </label>
              {renderCampoInput(
                campo.key,
                borrador[campo.key],
                (v) => setBorrador((prev) => ({ ...prev, [campo.key]: v })),
                campo.key === config.pk && !config.pkGenerada,
              )}
            </div>
          ))}
          <div className="col-span-full flex gap-3">
            <button type="submit" className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90">
              Guardar cambios
            </button>
            <button type="button" onClick={cancelarEdicion} className="text-sm text-ink/50 hover:text-ink">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink/50">
              {columnas.map((campo) => (
                <th key={campo.key} className="truncate px-3 py-2 font-medium">
                  {campo.etiqueta}
                </th>
              ))}
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={columnas.length + 1} className="px-3 py-6 text-center text-ink/40">
                  Cargando…
                </td>
              </tr>
            ) : filas.length === 0 ? (
              <tr>
                <td colSpan={columnas.length + 1} className="px-3 py-6 text-center text-ink/40">
                  {config.requiereBusqueda && busqueda.trim().length < 2
                    ? "Escribe al menos 2 letras para buscar."
                    : "Sin resultados."}
                </td>
              </tr>
            ) : (
              filas.map((fila) => {
                const enEdicion = editandoPk === fila[config.pk];
                return (
                  <tr
                    key={fila[config.pk]}
                    className={`border-b border-line last:border-0 ${enEdicion ? "bg-paper" : ""}`}
                  >
                    {columnas.map((campo) => {
                      const texto =
                        campo.tipo === "select"
                          ? etiquetaDe(campo.key, fila[campo.key])
                          : campo.tipo === "sino"
                            ? fila[campo.key] === false || fila[campo.key] === "false"
                              ? "No"
                              : "Sí"
                            : fila[campo.key];
                      return (
                        <td key={campo.key} className="truncate px-3 py-2" title={texto ? String(texto) : undefined}>
                          {campo.enlace && texto ? (
                            <EnlaceDrive tipo={campo.enlace} id={String(texto)} />
                          ) : (
                            texto ?? <span className="text-ink/30">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {enEdicion ? (
                        <span className="text-xs text-ink/40">Editando</span>
                      ) : (
                        <button
                          onClick={() => empezarEdicion(fila)}
                          className="text-ink/50 hover:text-ink"
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
