"use client";

// ---------------------------------------------------------------------------
// Formulario público de registro de huéspedes con un único enlace para todas las reservas.
// Se rellenan de una vez la estancia y los datos de todos los huéspedes. La base de datos lo vincula a la entrada por
// la fecha de entrada y el nombre de la reserva (el huésped que coincide es el titular); si no puede, queda
// pendiente de asignar a mano en Entradas. Al huésped se le confirma igual en ambos casos.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CamposPaso,
  Campo,
  Marco,
  T,
  VACIO,
  fechaLarga,
  limpiarDoc,
  usePaises,
  validarPaso,
  type Catalogos,
  type Errores,
  type Huesped,
  type Idioma,
} from "@/app/f/[token]/FormularioHuespedes";

const TR = {
  es: {
    intro:
      "La ley española nos obliga a registrar a todas las personas que se alojan. Rellena los datos de todos los huéspedes de la reserva, incluida la persona que hizo la reserva.",
    estancia: "Tu estancia",
    entrada: "Fecha de entrada",
    salida: "Fecha de salida",
    numHuespedes: "Número de huéspedes (adultos y niños)",
    empezar: "Empezar",
    huesped: (n: number, total: number) => `Huésped ${n} de ${total}`,
    siguienteHuesped: "Siguiente huésped →",
    revisar: "Revisar y enviar →",
    resumen: "Revisa y envía",
    resumenSub: "Comprueba que están todos los huéspedes. Puedes corregir cualquiera antes de enviar.",
    editar: "Corregir",
    cambiarEstancia: "Cambiar fechas o número de huéspedes",
    enviar: "Enviar el registro",
    enviando: "Enviando…",
    enviado: "¡Registro enviado!",
    enviadoSub: "Gracias. Hemos recibido los datos de todos los huéspedes. No tienes que hacer nada más. ¡Te esperamos!",
    fechasMal: "Revisa las fechas: la salida tiene que ser posterior a la entrada.",
    errorEnvio: "No se ha podido enviar. Revisa los datos e inténtalo de nuevo.",
    errorHuesped: (n: number) => `Revisa los datos del huésped ${n}.`,
    demasiados: "Ahora mismo no podemos recibir el registro. Inténtalo de nuevo en un rato.",
    reutilizar: "Hemos copiado la dirección, el país y el motivo del viaje del huésped anterior; cámbialos si no coinciden.",
  },
  en: {
    intro:
      "Spanish law requires us to register everyone staying with us. Please fill in the details of every guest on the booking, including the person who made the booking.",
    estancia: "Your stay",
    entrada: "Check-in date",
    salida: "Check-out date",
    numHuespedes: "Number of guests (adults and children)",
    empezar: "Start",
    huesped: (n: number, total: number) => `Guest ${n} of ${total}`,
    siguienteHuesped: "Next guest →",
    revisar: "Review and send →",
    resumen: "Review and send",
    resumenSub: "Check that every guest is here. You can correct anyone before sending.",
    editar: "Edit",
    cambiarEstancia: "Change dates or number of guests",
    enviar: "Send registration",
    enviando: "Sending…",
    enviado: "Registration sent!",
    enviadoSub: "Thank you. We have received the details of every guest. There's nothing else to do. See you soon!",
    fechasMal: "Please check the dates: check-out must be after check-in.",
    errorEnvio: "We couldn't send it. Please check the details and try again.",
    errorHuesped: (n: number) => `Please check the details of guest ${n}.`,
    demasiados: "We can't receive the registration right now. Please try again in a while.",
    reutilizar: "We've copied the address, country and purpose of the trip from the previous guest; change them if they differ.",
  },
};

type Fase = "estancia" | "huesped" | "resumen" | "enviado";
type Borrador = { entrada: string; salida: string; num: number; huespedes: Huesped[] };
const CLAVE = "registro-huespedes-borrador";
const PASOS_HUESPED = 4;

export default function FormularioRegistro() {
  const supabase = useMemo(() => createClient(), []);
  const [idioma, setIdioma] = useState<Idioma>("es");
  const t = T[idioma];
  const tr = TR[idioma];
  const arriba = useRef<HTMLDivElement>(null);

  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [fase, setFase] = useState<Fase>("estancia");
  const [entrada, setEntrada] = useState("");
  const [salida, setSalida] = useState("");
  const [num, setNum] = useState(1);
  const [huespedes, setHuespedes] = useState<Huesped[]>([{ ...VACIO }]);
  const [actual, setActual] = useState(0);
  const [paso, setPaso] = useState(0);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!navigator.language?.toLowerCase().startsWith("es")) setIdioma("en");
    try {
      const b = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Borrador | null;
      if (b?.huespedes?.length) {
        setEntrada(b.entrada);
        setSalida(b.salida);
        setNum(b.num);
        setHuespedes(b.huespedes.map((h) => ({ ...VACIO, ...h, consentimiento: false })));
      }
    } catch {}
    supabase.rpc("registro_catalogos").then(({ data }) => setCatalogos((data as Catalogos) ?? null));
  }, [supabase]);

  useEffect(() => {
    if (fase === "enviado") return;
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ entrada, salida, num, huespedes } satisfies Borrador));
    } catch {}
  }, [entrada, salida, num, huespedes, fase]);

  const paises = usePaises(catalogos?.paises);
  const buscarMunicipio = async (q: string) => {
    const { data } = await supabase.rpc("registro_municipios", { p_q: q });
    return (data as { codigo: string; nombre: string }[]) ?? [];
  };

  const h = huespedes[actual] ?? VACIO;
  const cambiar = <K extends keyof Huesped>(k: K, v: Huesped[K]) => {
    setHuespedes((lista) =>
      lista.map((x, i) => {
        if (i !== actual) return x;
        const n = { ...x, [k]: v };
        if (k === "nacionalidad_codigo" && !x.pais_codigo) n.pais_codigo = v as string;
        if (k === "pais_codigo" && v !== x.pais_codigo) {
          n.codigo_municipio_ref = "";
          n.municipio_texto = "";
          n.nombre_municipio = "";
        }
        return n;
      }),
    );
    setErrores((e) => ({ ...e, [k]: undefined }));
  };

  const subir = () => arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  function empezar(e: React.FormEvent) {
    e.preventDefault();
    if (!entrada || !salida || salida <= entrada) return setErrorGeneral(tr.fechasMal);
    setErrorGeneral("");
    // Ajusta la lista al número de huéspedes conservando lo ya escrito.
    setHuespedes((lista) =>
      Array.from({ length: num }, (_, i) => lista[i] ?? copiaDe(lista[lista.length - 1] ?? VACIO)),
    );
    setActual(0);
    setPaso(0);
    setFase("huesped");
    subir();
  }

  function avanzar() {
    const e = validarPaso(paso, h, t);
    setErrores(e);
    if (Object.keys(e).length) return;
    if (paso < PASOS_HUESPED - 1) {
      setPaso(paso + 1);
    } else if (actual < num - 1) {
      // El siguiente huésped empieza con los datos que suelen repetirse (si aún no tiene nada escrito).
      setHuespedes((lista) => lista.map((x, i) => (i === actual + 1 && !x.nombre ? copiaDe(h) : x)));
      setActual(actual + 1);
      setPaso(0);
    } else {
      setFase("resumen");
    }
    subir();
  }

  async function enviar() {
    setEnviando(true);
    setErrorGeneral("");
    const { data, error } = await supabase.rpc("registro_enviar", {
      p: {
        fecha_entrada: entrada,
        fecha_salida: salida,
        huespedes: huespedes.slice(0, num).map(({ municipio_texto, ...x }) => {
          void municipio_texto;
          return { ...x, numero_documento: limpiarDoc(x.numero_documento) };
        }),
      },
    });
    setEnviando(false);
    const r = data as { ok: boolean; error?: string; huesped?: number } | null;
    if (error || !r) return setErrorGeneral(tr.errorEnvio);
    if (r.ok) {
      try {
        localStorage.removeItem(CLAVE);
      } catch {}
      setFase("enviado");
      subir();
      return;
    }
    if (r.error === "huesped" && r.huesped) {
      setActual(r.huesped - 1);
      setPaso(0);
      setFase("huesped");
      setErrorGeneral(tr.errorHuesped(r.huesped));
    } else if (r.error === "fechas") {
      setFase("estancia");
      setErrorGeneral(tr.fechasMal);
    } else setErrorGeneral(r.error === "demasiados_envios" ? tr.demasiados : tr.errorEnvio);
    subir();
  }

  const marco = { idioma, setIdioma, titulo: t.cabecera, refArriba: arriba };

  if (!catalogos) return <Marco {...marco}><p className="py-16 text-center text-sm text-ink/50">{t.cargando}</p></Marco>;

  if (fase === "enviado") {
    return (
      <Marco {...marco}>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="text-3xl" aria-hidden>✓</p>
          <p className="mt-2 font-display text-xl font-semibold text-emerald-900">{tr.enviado}</p>
          <p className="mt-1 text-sm text-emerald-900/70">{tr.enviadoSub}</p>
        </div>
      </Marco>
    );
  }

  const estanciaResumen = entrada && salida && fase !== "estancia" && (
    <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink/50">{tr.estancia}</p>
      <p className="mt-0.5 font-medium">
        {fechaLarga(entrada, idioma)} → {fechaLarga(salida, idioma)} · {num} {idioma === "es" ? (num === 1 ? "huésped" : "huéspedes") : num === 1 ? "guest" : "guests"}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all"
          style={{ width: `${fase === "resumen" ? 100 : Math.round(((actual + paso / PASOS_HUESPED) / num) * 100)}%` }}
        />
      </div>
    </section>
  );

  return (
    <Marco {...marco}>
      {fase === "estancia" && (
        <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
          <p className="text-sm text-ink/70">{tr.intro}</p>
          <form onSubmit={empezar} className="mt-5 space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="entrada" etiqueta={tr.entrada}>
                <input id="entrada" type="date" value={entrada} onChange={(e) => setEntrada(e.target.value)} required />
              </Campo>
              <Campo id="salida" etiqueta={tr.salida}>
                <input id="salida" type="date" min={entrada || undefined} value={salida} onChange={(e) => setSalida(e.target.value)} required />
              </Campo>
            </div>
            <Campo id="num" etiqueta={tr.numHuespedes}>
              <select id="num" value={num} onChange={(e) => setNum(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Campo>
            {errorGeneral && <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{errorGeneral}</p>}
            <div className="flex justify-end">
              <button type="submit" className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-ink/90">
                {tr.empezar} →
              </button>
            </div>
          </form>
        </section>
      )}

      {fase === "huesped" && (
        <>
          {estanciaResumen}
          {actual > 0 && paso === 0 && !errorGeneral && (
            <p className="mt-4 rounded-xl border border-line bg-white p-3 text-xs text-ink/60">{tr.reutilizar}</p>
          )}
          <section className="mt-4 rounded-xl border border-line bg-white">
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <p className="font-display text-lg font-semibold">{tr.huesped(actual + 1, num)}</p>
              <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Pasos">
                {t.pasos.map((nombre, i) => (
                  <li key={nombre}>
                    <div className={`h-1 rounded-full ${i <= paso ? "bg-ink" : "bg-line"}`} />
                    <p className={`mt-1 truncate text-[11px] ${i === paso ? "font-medium text-ink" : "text-ink/40"}`}>{nombre}</p>
                  </li>
                ))}
              </ol>
            </div>
            <form
              className="space-y-4 px-4 py-5 sm:px-5"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                avanzar();
              }}
            >
              <CamposPaso
                key={actual}
                paso={paso}
                h={h}
                cambiar={cambiar}
                errores={errores}
                catalogos={catalogos}
                idioma={idioma}
                paises={paises}
                buscarMunicipio={buscarMunicipio}
              />
              {errorGeneral && <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{errorGeneral}</p>}
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrores({});
                    if (paso > 0) setPaso(paso - 1);
                    else if (actual > 0) {
                      setActual(actual - 1);
                      setPaso(PASOS_HUESPED - 1);
                    } else setFase("estancia");
                    subir();
                  }}
                  className="rounded-md px-3 py-2.5 text-sm text-ink/60 hover:text-ink"
                >
                  ← {t.atras}
                </button>
                <button type="submit" className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-ink/90">
                  {paso < PASOS_HUESPED - 1 ? `${t.siguiente} →` : actual < num - 1 ? tr.siguienteHuesped : tr.revisar}
                </button>
              </div>
            </form>
          </section>
        </>
      )}

      {fase === "resumen" && (
        <>
          {estanciaResumen}
          <section className="mt-4 rounded-xl border border-line bg-white p-4 sm:p-5">
            <p className="font-display text-lg font-semibold">{tr.resumen}</p>
            <p className="mt-1 text-sm text-ink/60">{tr.resumenSub}</p>
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
              {huespedes.slice(0, num).map((x, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span>
                    <span className="font-medium">
                      {[x.nombre, x.apellido1, x.apellido2].filter(Boolean).join(" ")}
                    </span>
                    <span className="block text-xs text-ink/50">
                      {x.numero_documento}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActual(i);
                      setPaso(0);
                      setFase("huesped");
                      subir();
                    }}
                    className="text-xs text-ink/60 underline hover:text-ink"
                  >
                    {tr.editar}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setFase("estancia")} className="mt-3 text-xs text-ink/50 underline hover:text-ink">
              {tr.cambiarEstancia}
            </button>
            {errorGeneral && <p className="mt-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{errorGeneral}</p>}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={enviando}
                onClick={enviar}
                className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
              >
                {enviando ? tr.enviando : tr.enviar}
              </button>
            </div>
          </section>
        </>
      )}
    </Marco>
  );

  function copiaDe(x: Huesped): Huesped {
    return {
      ...VACIO,
      parentesco_codigo: "",
      pais_codigo: x.pais_codigo,
      direccion: x.direccion,
      codigo_postal: x.codigo_postal,
      codigo_municipio_ref: x.codigo_municipio_ref,
      municipio_texto: x.municipio_texto,
      nombre_municipio: x.nombre_municipio,
      motivo_viaje: x.motivo_viaje,
    };
  }
}
