"use client";

// "+ Nueva entrada" junto al título de Entradas. En la lista abre el alta (evento "nueva-entrada" que escucha
// EntradasView); en el calendario lleva a la lista con el alta abierta (/?nueva=1).

import Link from "next/link";

const clase = "rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink/90";

export default function BotonNuevaEntrada({ enLista }: { enLista: boolean }) {
  if (!enLista)
    return (
      <Link href="/?nueva=1" className={clase}>
        + Nueva entrada
      </Link>
    );
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("nueva-entrada"))} className={clase}>
      + Nueva entrada
    </button>
  );
}
