"use client";

// Campo de fecha que siempre se ve como día-mes-año (16-11-2026), sea cual sea el idioma del navegador
// (el <input type="date"> nativo usa el formato del navegador: en inglés sale mes/día/año).
// Se escribe a mano (dd-mm-aaaa, también con / o .) o se elige en el calendario nativo con el botón.
// Valor y onChange en ISO (aaaa-mm-dd), o "" si está vacío.

import { useEffect, useRef, useState } from "react";

const aTexto = (iso: string) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

function aIso(texto: string): string | null {
  const t = texto.trim();
  if (!t) return "";
  const m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(a, mes - 1, d);
  if (f.getFullYear() !== a || f.getMonth() !== mes - 1 || f.getDate() !== d) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function CampoFecha({
  valor,
  onChange,
  id,
  className = "",
  ariaLabel,
}: {
  valor: string;
  onChange: (iso: string) => void;
  id?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [texto, setTexto] = useState(aTexto(valor));
  const [malo, setMalo] = useState(false);
  const nativo = useRef<HTMLInputElement>(null);

  // Si el valor cambia desde fuera (otro campo, el calendario), se actualiza el texto.
  useEffect(() => {
    if (aIso(texto) !== (valor ?? "")) setTexto(aTexto(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  function escribir(v: string) {
    setTexto(v);
    const iso = aIso(v);
    setMalo(iso === null && v.trim().length >= 8);
    if (iso !== null && iso !== (valor ?? "")) onChange(iso);
  }

  function abrirCalendario() {
    const el = nativo.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }

  return (
    <div className={`relative flex items-center gap-1 ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="dd-mm-aaaa"
        aria-label={ariaLabel}
        aria-invalid={malo || undefined}
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        onBlur={() => {
          const iso = aIso(texto);
          if (iso === null) setMalo(true);
          else setTexto(aTexto(iso));
        }}
        className={`!py-1.5 ${malo ? "!border-clay" : ""}`}
      />
      <button
        type="button"
        onClick={abrirCalendario}
        title="Elegir en el calendario"
        aria-label="Elegir en el calendario"
        className="shrink-0 rounded-md border border-line px-2 py-1.5 text-sm text-ink/60 hover:text-ink"
      >
        📅
      </button>
      <input
        ref={nativo}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={valor || ""}
        onChange={(e) => {
          setMalo(false);
          setTexto(aTexto(e.target.value));
          onChange(e.target.value);
        }}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
    </div>
  );
}
