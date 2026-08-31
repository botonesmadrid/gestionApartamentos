"use client";

import { useMemo, useState } from "react";

type Provincia = { codigo: string; nombre: string };
type Municipio = { codigo: string; nombre: string; provincia_codigo: string | null };

export default function MunicipioSelect({
  provincias,
  municipios,
}: {
  provincias: Provincia[];
  municipios: Municipio[];
}) {
  const [provinciaCodigo, setProvinciaCodigo] = useState("");

  const municipiosFiltrados = useMemo(() => {
    if (!provinciaCodigo) return [];
    return municipios.filter((m) => m.provincia_codigo === provinciaCodigo);
  }, [provinciaCodigo, municipios]);

  return (
    <>
      <div>
        <label htmlFor="provincia_codigo_filtro">Provincia (residencia)</label>
        <select
          id="provincia_codigo_filtro"
          value={provinciaCodigo}
          onChange={(e) => setProvinciaCodigo(e.target.value)}
        >
          <option value="">Selecciona provincia…</option>
          <option value="NOESP">No aplica (residencia no española)</option>
          {provincias.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="codigo_municipio_ref">Municipio</label>
        <select
          id="codigo_municipio_ref"
          name="codigo_municipio_ref"
          defaultValue=""
          disabled={!provinciaCodigo}
        >
          <option value="" disabled>
            {provinciaCodigo ? "Selecciona municipio…" : "Elige antes una provincia"}
          </option>
          {provinciaCodigo === "NOESP" && <option value="NOESP">No aplica</option>}
          {municipiosFiltrados.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.nombre.split("-").slice(1).join("-") || m.nombre}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
