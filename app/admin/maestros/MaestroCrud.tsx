"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MaestroConfig } from "./config";

type Fila = Record<string, any>;
type Opciones = Record<string, { valor: string; etiqueta: string }[]>;

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
    for (const campo of config.campos) cambios[campo.key] = borrador[campo.key] || null;

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
    for (const campo of config.campos) insertar[campo.key] = nuevaFila[campo.key] || null;

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
    return (
      <input
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    );
  }

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
          className="max-w-xs"
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

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink/50">
              {config.campos.map((campo) => (
                <th key={campo.key} className="px-3 py-2 font-medium">
                  {campo.etiqueta}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={config.campos.length + 1} className="px-3 py-6 text-center text-ink/40">
                  Cargando…
                </td>
              </tr>
            ) : filas.length === 0 ? (
              <tr>
                <td colSpan={config.campos.length + 1} className="px-3 py-6 text-center text-ink/40">
                  {config.requiereBusqueda && busqueda.trim().length < 2
                    ? "Escribe al menos 2 letras para buscar."
                    : "Sin resultados."}
                </td>
              </tr>
            ) : (
              filas.map((fila) => {
                const enEdicion = editandoPk === fila[config.pk];
                return (
                  <tr key={fila[config.pk]} className="border-b border-line last:border-0">
                    {config.campos.map((campo) => (
                      <td key={campo.key} className="px-3 py-2">
                        {enEdicion
                          ? renderCampoInput(
                              campo.key,
                              borrador[campo.key],
                              (v) => setBorrador((prev) => ({ ...prev, [campo.key]: v })),
                              campo.key === config.pk && !config.pkGenerada
                            )
                          : campo.tipo === "select"
                          ? etiquetaDe(campo.key, fila[campo.key])
                          : fila[campo.key]}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {enEdicion ? (
                        <>
                          <button
                            onClick={guardarEdicion}
                            className="mr-2 text-ink/70 hover:text-ink"
                          >
                            Guardar
                          </button>
                          <button onClick={cancelarEdicion} className="text-ink/40 hover:text-ink">
                            Cancelar
                          </button>
                        </>
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
