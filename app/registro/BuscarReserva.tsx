"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const T = {
  es: {
    titulo: "Registro de huéspedes",
    intro: "La ley española nos obliga a registrar a todas las personas que se alojan. Indica tu reserva para empezar.",
    codigo: "Número de reserva",
    ayudaCodigo: "Lo encuentras en la confirmación de Booking, Airbnb… (p. ej. 6901947450 o HMABC12345).",
    entrada: "Fecha de entrada",
    continuar: "Continuar",
    buscando: "Buscando…",
    noEncontrada:
      "No encontramos una reserva activa con ese número y esa fecha de entrada. Revisa los datos o escríbenos por el chat de la reserva.",
    intentos: "Demasiados intentos. Inténtalo de nuevo más tarde.",
    error: "No se ha podido consultar. Inténtalo de nuevo.",
  },
  en: {
    titulo: "Guest registration",
    intro: "Spanish law requires us to register everyone staying with us. Enter your booking to start.",
    codigo: "Booking number",
    ayudaCodigo: "You'll find it in your Booking, Airbnb… confirmation (e.g. 6901947450 or HMABC12345).",
    entrada: "Check-in date",
    continuar: "Continue",
    buscando: "Searching…",
    noEncontrada:
      "We couldn't find an active booking with that number and check-in date. Please check the details or message us through the booking chat.",
    intentos: "Too many attempts. Please try again later.",
    error: "Something went wrong. Please try again.",
  },
};

export default function BuscarReserva({ codigoInicial, entradaInicial }: { codigoInicial: string; entradaInicial: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [idioma, setIdioma] = useState<"es" | "en">("es");
  const [codigo, setCodigo] = useState(codigoInicial);
  const [entrada, setEntrada] = useState(/^\d{4}-\d{2}-\d{2}$/.test(entradaInicial) ? entradaInicial : "");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  const t = T[idioma];

  useEffect(() => {
    if (!navigator.language?.toLowerCase().startsWith("es")) setIdioma("en");
  }, []);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (!codigo.trim() || !entrada) return;
    setBuscando(true);
    setError("");
    const { data, error: err } = await supabase.rpc("formulario_buscar", { p_codigo: codigo, p_entrada: entrada });
    setBuscando(false);
    const r = data as { estado: string; token?: string } | null;
    if (err || !r) return setError(t.error);
    if (r.estado === "ok" && r.token) return router.replace(`/f/${r.token}`);
    setError(r.estado === "demasiados_intentos" ? t.intentos : t.noEncontrada);
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-paper px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Image src="/logo-botones.jpg" alt="Botones" width={36} height={36} className="rounded" />
          <h1 className="font-display text-xl font-semibold">{t.titulo}</h1>
        </div>
        <button
          type="button"
          onClick={() => setIdioma(idioma === "es" ? "en" : "es")}
          className="rounded-md border border-line px-2 py-1 text-xs text-ink/70"
        >
          {idioma === "es" ? "English" : "Español"}
        </button>
      </div>
      <p className="mt-4 text-sm text-ink/70">{t.intro}</p>
      <form onSubmit={buscar} className="mt-6 space-y-4 rounded-lg border border-line bg-white p-4">
        <div>
          <label htmlFor="codigo">{t.codigo}</label>
          <input
            id="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            required
          />
          <p className="mt-1 text-xs text-ink/50">{t.ayudaCodigo}</p>
        </div>
        <div>
          <label htmlFor="entrada">{t.entrada}</label>
          <input id="entrada" type="date" value={entrada} onChange={(e) => setEntrada(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-clay">{error}</p>}
        <button
          type="submit"
          disabled={buscando}
          className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
        >
          {buscando ? t.buscando : t.continuar}
        </button>
      </form>
    </main>
  );
}
