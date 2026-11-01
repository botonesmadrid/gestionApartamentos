"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Formulario público de registro de huéspedes (obligatorio por ley en España).
// Un enlace por reserva; se registra un huésped cada vez hasta completar todos.
// Solo usa las funciones formulario_* de la base de datos (validan el token).
// ---------------------------------------------------------------------------

type Idioma = "es" | "en";
type Opcion = { codigo: string; nombre?: string; descripcion?: string };
type Datos = {
  estado: "ok" | "no_encontrado" | "cerrado";
  titular: string;
  piso: string;
  fecha_entrada: string;
  fecha_salida: string;
  num_huespedes: number | null;
  registrados: number;
  nombres_registrados: string[];
  paises: Opcion[];
  tipos_documento: Opcion[];
  sexos: Opcion[];
  parentescos: Opcion[];
};

type Huesped = {
  nombre: string;
  apellido1: string;
  apellido2: string;
  nacionalidad_codigo: string;
  sexo_codigo: string;
  fecha_nacimiento: string;
  tipo_documento_codigo: string;
  numero_documento: string;
  soporte_documento: string;
  pais_codigo: string;
  direccion: string;
  codigo_postal: string;
  codigo_municipio_ref: string;
  municipio_texto: string; // nombre visible del municipio español elegido
  nombre_municipio: string; // ciudad si la residencia no es España
  parentesco_codigo: string;
  telefono: string;
  correo: string;
  motivo_viaje: string;
  consentimiento: boolean;
};

const VACIO: Huesped = {
  nombre: "", apellido1: "", apellido2: "", nacionalidad_codigo: "", sexo_codigo: "",
  fecha_nacimiento: "", tipo_documento_codigo: "", numero_documento: "", soporte_documento: "",
  pais_codigo: "", direccion: "", codigo_postal: "", codigo_municipio_ref: "", municipio_texto: "",
  nombre_municipio: "", parentesco_codigo: "", telefono: "", correo: "", motivo_viaje: "", consentimiento: false,
};

// Motivos del viaje (los mismos que el formulario anterior: se guardan tal cual).
const MOTIVOS = [
  "Visita de carácter cultural. / Cultural visit",
  "Trabajo. / Work",
  "Tratamiento médico / Medical treatment",
  "Visita a familiares o amigos. / Visit of family or friends",
  "Formación. / Education/training",
  "Desplazamiento por estudios de hijos. / Accompanying children for study purposes",
  "Reforma del hogar. / Home renovation",
];

const TIPOS_DOC: Record<string, { es: string; en: string }> = {
  NIF: { es: "DNI español", en: "Spanish ID card (DNI)" },
  NIE: { es: "NIE / Permiso de residencia en España", en: "NIE / Spanish residence permit" },
  PAS: { es: "Pasaporte", en: "Passport" },
  OTRO: { es: "Otro documento de identidad", en: "Other identity document" },
};
const ORDEN_DOC = ["PAS", "NIF", "NIE", "OTRO"];

const SEXOS: Record<string, { es: string; en: string }> = {
  M: { es: "Mujer", en: "Female" },
  H: { es: "Hombre", en: "Male" },
  O: { es: "Otro", en: "Other" },
};

const PARENTESCOS: Record<string, { es: string; en: string }> = {
  CY: { es: "Cónyuge / pareja", en: "Spouse / partner" },
  HJ: { es: "Hijo/a", en: "Son / daughter" },
  PM: { es: "Padre o madre", en: "Father or mother" },
  HR: { es: "Hermano/a", en: "Brother / sister" },
  AB: { es: "Abuelo/a", en: "Grandparent" },
  NI: { es: "Nieto/a", en: "Grandchild" },
  TI: { es: "Tío/a", en: "Uncle / aunt" },
  SB: { es: "Sobrino/a", en: "Nephew / niece" },
  CD: { es: "Cuñado/a", en: "Brother / sister-in-law" },
  SG: { es: "Suegro/a", en: "Father / mother-in-law" },
  YN: { es: "Yerno / nuera", en: "Son / daughter-in-law" },
  BA: { es: "Bisabuelo/a", en: "Great-grandparent" },
  BN: { es: "Bisnieto/a", en: "Great-grandchild" },
  TU: { es: "Tutor/a", en: "Legal guardian" },
  OT: { es: "Otro / ninguno (amigo, compañero…)", en: "Other / none (friend, colleague…)" },
};

// Países más habituales primero.
const PAISES_TOP = ["ESP", "USA", "GBR", "FRA", "ITA", "DEU", "PRT", "NLD", "MEX", "ARG"];

const T = {
  es: {
    cabecera: "Registro de huéspedes",
    intro: (t: string) =>
      `Hola${t ? ` ${t}` : ""}, la ley española nos obliga a registrar a todas las personas que se alojan. Son unos 2 minutos por persona.`,
    estancia: "Tu estancia",
    huespedDe: (n: number, total: number | null) => `Huésped ${n}${total ? ` de ${total}` : ""}`,
    yaRegistrados: "Ya registrados",
    pasos: ["Datos personales", "Documento", "Residencia", "Contacto"],
    siguiente: "Siguiente",
    atras: "Atrás",
    enviar: "Registrar huésped",
    enviando: "Enviando…",
    opcional: "opcional",
    elige: "Elige…",
    nombre: "Nombre",
    apellido1: "Primer apellido",
    apellido2: "Segundo apellido",
    apellido2Ayuda: "Si no tienes segundo apellido, déjalo en blanco.",
    nacionalidad: "Nacionalidad",
    sexo: "Sexo",
    fechaNac: "Fecha de nacimiento",
    tipoDoc: "Tipo de documento",
    tipoDocAyuda: "El carnet de conducir no es válido.",
    numDoc: "Número de documento",
    soporte: "Número de soporte",
    soporteAyuda: "En el DNI aparece como «IDESP» o «Nº soporte» (3 letras y 6 números). En el NIE, junto a la foto.",
    paisRes: "País de residencia",
    direccion: "Dirección",
    cp: "Código postal",
    municipio: "Municipio",
    municipioBuscar: "Escribe para buscar tu municipio…",
    ciudad: "Ciudad",
    parentesco: "Parentesco con el titular de la reserva",
    parentescoAyuda: "Si eres el titular, elige «Otro / ninguno».",
    telefono: "Teléfono",
    correo: "Correo electrónico",
    motivo: "Motivo del viaje",
    privacidad: "Protección de datos",
    privacidadLeer: "Leer la información completa",
    acepto: "He leído y acepto la política de privacidad y consiento el tratamiento de mis datos personales para los fines indicados.",
    obligatorio: "Este campo es obligatorio.",
    dniMal: "El número no es un DNI válido (8 números y la letra).",
    nieMal: "El número no es un NIE válido (X/Y/Z, 7 números y la letra).",
    correoMal: "Revisa el correo electrónico.",
    telefonoMal: "Revisa el teléfono (incluye el prefijo del país).",
    fechaMal: "Revisa la fecha de nacimiento.",
    errorEnvio: "No se ha podido registrar. Revisa los datos e inténtalo de nuevo.",
    registrado: (n: string) => `${n} está registrado/a.`,
    faltan: (n: number) => (n === 1 ? "Falta 1 huésped." : `Faltan ${n} huéspedes.`),
    siguienteHuesped: "Registrar al siguiente huésped",
    reutilizar: "Mantendremos la dirección, el país y el motivo del viaje para no tener que repetirlos.",
    completo: "¡Listo! Ya están registrados todos los huéspedes.",
    completoSub: "Gracias. No tienes que hacer nada más. ¡Te esperamos!",
    noEncontrado: "Este enlace no es válido.",
    noEncontradoSub: "Revisa que lo has copiado entero o escríbenos a hola@botonesmadrid.com.",
    cerrado: "Este formulario ya no está disponible.",
    cerradoSub: "La reserva ha finalizado o se ha cancelado. Si es un error, escríbenos a hola@botonesmadrid.com.",
    lleno: "Ya están registrados todos los huéspedes de esta reserva.",
    otroHuesped: "Registrar otro huésped",
    cargando: "Cargando…",
  },
  en: {
    cabecera: "Guest registration",
    intro: (t: string) =>
      `Hi${t ? ` ${t}` : ""}, Spanish law requires us to register everyone staying with us. It takes about 2 minutes per person.`,
    estancia: "Your stay",
    huespedDe: (n: number, total: number | null) => `Guest ${n}${total ? ` of ${total}` : ""}`,
    yaRegistrados: "Already registered",
    pasos: ["Personal details", "ID document", "Residence", "Contact"],
    siguiente: "Next",
    atras: "Back",
    enviar: "Register guest",
    enviando: "Sending…",
    opcional: "optional",
    elige: "Choose…",
    nombre: "First name",
    apellido1: "Last name",
    apellido2: "Second last name",
    apellido2Ayuda: "Leave it blank if you don't have one.",
    nacionalidad: "Nationality",
    sexo: "Sex",
    fechaNac: "Date of birth",
    tipoDoc: "Document type",
    tipoDocAyuda: "Driving licences are not accepted.",
    numDoc: "Document number",
    soporte: "Support number",
    soporteAyuda: "On the Spanish DNI it appears as «IDESP» or «Nº soporte» (3 letters and 6 digits). On the NIE, next to the photo.",
    paisRes: "Country of residence",
    direccion: "Address",
    cp: "Postal code",
    municipio: "Municipality",
    municipioBuscar: "Type to search your municipality…",
    ciudad: "City",
    parentesco: "Relationship with the lead guest",
    parentescoAyuda: "If you are the lead guest, choose «Other / none».",
    telefono: "Phone",
    correo: "Email",
    motivo: "Purpose of the trip",
    privacidad: "Data protection",
    privacidadLeer: "Read the full information",
    acepto: "I have read and accept the Privacy Policy and give my consent to the processing of my personal data for the purposes described.",
    obligatorio: "This field is required.",
    dniMal: "This is not a valid DNI number (8 digits and the letter).",
    nieMal: "This is not a valid NIE number (X/Y/Z, 7 digits and the letter).",
    correoMal: "Please check the email address.",
    telefonoMal: "Please check the phone number (include the country code).",
    fechaMal: "Please check the date of birth.",
    errorEnvio: "We couldn't register the guest. Please check the details and try again.",
    registrado: (n: string) => `${n} is registered.`,
    faltan: (n: number) => (n === 1 ? "1 guest left." : `${n} guests left.`),
    siguienteHuesped: "Register the next guest",
    reutilizar: "We'll keep the address, country and purpose of the trip so you don't have to type them again.",
    completo: "All done! Every guest is registered.",
    completoSub: "Thank you. There's nothing else to do. See you soon!",
    noEncontrado: "This link is not valid.",
    noEncontradoSub: "Make sure you copied the whole link or write to hola@botonesmadrid.com.",
    cerrado: "This form is no longer available.",
    cerradoSub: "The booking has ended or been cancelled. If this is a mistake, write to hola@botonesmadrid.com.",
    lleno: "All guests for this booking are already registered.",
    otroHuesped: "Register another guest",
    cargando: "Loading…",
  },
};

const PRIVACIDAD = {
  es: `En cumplimiento del Reglamento (UE) 2016/679 (RGPD) y de la Ley Orgánica 3/2018 (LOPDGDD), le informamos de que los datos personales recogidos en este formulario serán tratados por Raquel Albarracín García (53661022K), con la finalidad de gestionar reservas, prestar servicios relacionados con el alojamiento turístico y atender sus solicitudes o consultas. Los datos se conservarán durante el tiempo necesario para cumplir con dicha finalidad y con las obligaciones legales. No se cederán a terceros salvo obligación legal o cuando sea necesario para la prestación del servicio (por ejemplo, a plataformas de gestión de reservas o a la administración pública en cumplimiento de la normativa turística). Puede ejercer sus derechos de acceso, rectificación, supresión y demás derechos escribiendo a hola@botonesmadrid.com o a Calle Puerto de Navacerrada 16, 28220 Majadahonda (Madrid).`,
  en: `In compliance with Regulation (EU) 2016/679 (GDPR) and Spanish Organic Law 3/2018 (LOPDGDD), we inform you that the personal data collected through this form will be processed by Raquel Albarracín García (53661022K) for the purpose of managing reservations, providing services related to tourist accommodation and responding to your requests or inquiries. The data will be retained for as long as necessary to fulfil that purpose and to comply with legal obligations. It will not be transferred to third parties except where legally required or necessary for the provision of the service (e.g. to booking platforms or public authorities in compliance with tourism regulations). You may exercise your rights of access, rectification, erasure and others by writing to hola@botonesmadrid.com or to Calle Puerto de Navacerrada 16, 28220 Majadahonda (Madrid).`,
};

// --- Validaciones -----------------------------------------------------------
const LETRAS_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";
const limpiarDoc = (v: string) => v.toUpperCase().replace(/[\s-]/g, "");
function dniValido(v: string) {
  const m = limpiarDoc(v).match(/^(\d{8})([A-Z])$/);
  return !!m && LETRAS_DNI[Number(m[1]) % 23] === m[2];
}
function nieValido(v: string) {
  const m = limpiarDoc(v).match(/^([XYZ])(\d{7})([A-Z])$/);
  if (!m) return false;
  const n = Number("XYZ".indexOf(m[1]) + m[2]);
  return LETRAS_DNI[n % 23] === m[3];
}
const correoValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const telefonoValido = (v: string) => v.replace(/\D/g, "").length >= 7;

type Errores = Partial<Record<keyof Huesped, string>>;

function validarPaso(paso: number, h: Huesped, t: (typeof T)["es"]): Errores {
  const e: Errores = {};
  const req = (k: keyof Huesped) => {
    if (typeof h[k] === "string" && !(h[k] as string).trim()) e[k] = t.obligatorio;
  };
  if (paso === 0) {
    (["nombre", "apellido1", "nacionalidad_codigo", "sexo_codigo", "fecha_nacimiento"] as const).forEach(req);
    if (h.nacionalidad_codigo === "ESP") req("apellido2");
    if (h.fecha_nacimiento) {
      const f = new Date(h.fecha_nacimiento);
      if (isNaN(f.getTime()) || f > new Date() || f.getFullYear() < 1900) e.fecha_nacimiento = t.fechaMal;
    }
  }
  if (paso === 1) {
    (["tipo_documento_codigo", "numero_documento"] as const).forEach(req);
    if (h.numero_documento && h.tipo_documento_codigo === "NIF" && !dniValido(h.numero_documento)) e.numero_documento = t.dniMal;
    if (h.numero_documento && h.tipo_documento_codigo === "NIE" && !nieValido(h.numero_documento)) e.numero_documento = t.nieMal;
    if (h.tipo_documento_codigo === "NIF" || h.tipo_documento_codigo === "NIE") req("soporte_documento");
  }
  if (paso === 2) {
    (["pais_codigo", "direccion", "codigo_postal"] as const).forEach(req);
    if (h.pais_codigo === "ESP") {
      if (!h.codigo_municipio_ref) e.codigo_municipio_ref = t.obligatorio;
    } else req("nombre_municipio");
  }
  if (paso === 3) {
    (["parentesco_codigo", "telefono", "correo", "motivo_viaje"] as const).forEach(req);
    if (h.correo && !correoValido(h.correo)) e.correo = t.correoMal;
    if (h.telefono && !telefonoValido(h.telefono)) e.telefono = t.telefonoMal;
    if (!h.consentimiento) e.consentimiento = t.obligatorio;
  }
  return e;
}

function fechaLarga(iso: string, idioma: Idioma) {
  return new Date(iso + "T00:00:00").toLocaleDateString(idioma === "es" ? "es-ES" : "en-GB", {
    weekday: "short", day: "numeric", month: "long",
  });
}

// ---------------------------------------------------------------------------

export default function FormularioHuespedes({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [idioma, setIdioma] = useState<Idioma>("es");
  const t = T[idioma];

  const [datos, setDatos] = useState<Datos | null>(null);
  const [h, setH] = useState<Huesped>(VACIO);
  const [paso, setPaso] = useState(0);
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [recienRegistrado, setRecienRegistrado] = useState<string | null>(null);
  const [verPrivacidad, setVerPrivacidad] = useState(false);
  const arriba = useRef<HTMLDivElement>(null);
  const claveBorrador = `formulario-${token}`;

  // Idioma del navegador y borrador guardado en este dispositivo.
  useEffect(() => {
    if (!navigator.language?.toLowerCase().startsWith("es")) setIdioma("en");
    try {
      const b = localStorage.getItem(claveBorrador);
      if (b) setH({ ...VACIO, ...JSON.parse(b), consentimiento: false });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(claveBorrador, JSON.stringify(h));
    } catch {}
  }, [h, claveBorrador]);

  async function cargar() {
    const { data, error } = await supabase.rpc("formulario_obtener", { p_token: token });
    if (error || !data) setDatos({ estado: "no_encontrado" } as Datos);
    else setDatos(data as Datos);
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const cambiar = <K extends keyof Huesped>(k: K, v: Huesped[K]) => {
    setH((prev) => {
      const n = { ...prev, [k]: v };
      // Por comodidad: el país de residencia empieza igual que la nacionalidad.
      if (k === "nacionalidad_codigo" && !prev.pais_codigo) n.pais_codigo = v as string;
      if (k === "pais_codigo" && v !== prev.pais_codigo) {
        n.codigo_municipio_ref = "";
        n.municipio_texto = "";
        n.nombre_municipio = "";
      }
      return n;
    });
    setErrores((e) => ({ ...e, [k]: undefined }));
  };

  const irA = (p: number) => {
    setPaso(p);
    arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function siguiente() {
    const e = validarPaso(paso, h, t);
    setErrores(e);
    if (Object.keys(e).length === 0) irA(paso + 1);
  }

  async function enviar() {
    const e = validarPaso(3, h, t);
    setErrores(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setErrorEnvio("");
    const { municipio_texto, ...resto } = h;
    void municipio_texto;
    const { data, error } = await supabase.rpc("formulario_registrar", {
      p_token: token,
      p: { ...resto, numero_documento: limpiarDoc(h.numero_documento) },
    });
    setEnviando(false);
    const r = data as { ok: boolean; error?: string } | null;
    if (error || !r?.ok) {
      setErrorEnvio(r?.error === "completo" ? t.lleno : t.errorEnvio);
      return;
    }
    setRecienRegistrado(h.nombre.trim());
    // Siguiente huésped: se conservan los datos que suelen repetirse.
    const siguienteH: Huesped = {
      ...VACIO,
      pais_codigo: h.pais_codigo,
      direccion: h.direccion,
      codigo_postal: h.codigo_postal,
      codigo_municipio_ref: h.codigo_municipio_ref,
      municipio_texto: h.municipio_texto,
      nombre_municipio: h.nombre_municipio,
      motivo_viaje: h.motivo_viaje,
    };
    setH(siguienteH);
    setPaso(0);
    await cargar();
    arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const paises = useMemo(() => {
    const lista = datos?.paises ?? [];
    const top = PAISES_TOP.map((c) => lista.find((p) => p.codigo === c)).filter(Boolean) as Opcion[];
    return { top, resto: lista.filter((p) => !PAISES_TOP.includes(p.codigo)) };
  }, [datos?.paises]);

  // ---- Pantallas especiales ------------------------------------------------
  const marco = { idioma, setIdioma, titulo: t.cabecera, refArriba: arriba };

  if (!datos) return <Marco {...marco}><p className="py-16 text-center text-sm text-ink/50">{t.cargando}</p></Marco>;
  if (datos.estado !== "ok") {
    const noEnc = datos.estado === "no_encontrado";
    return (
      <Marco {...marco}>
        <div className="rounded-xl border border-line bg-white p-6 text-center">
          <p className="font-display text-xl font-semibold">{noEnc ? t.noEncontrado : t.cerrado}</p>
          <p className="mt-2 text-sm text-ink/60">{noEnc ? t.noEncontradoSub : t.cerradoSub}</p>
        </div>
      </Marco>
    );
  }

  const total = datos.num_huespedes;
  const registrados = datos.registrados;
  const completo = total != null && registrados >= total;
  const faltan = total != null ? Math.max(total - registrados, 0) : null;
  const pctReserva = total ? Math.round((registrados / total) * 100) : 0;

  const cabeceraEstancia = (
    <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
      <p className="text-sm text-ink/70">{t.intro(datos.titular)}</p>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/50">{t.estancia}</p>
          <p className="mt-0.5 font-medium">
            {fechaLarga(datos.fecha_entrada, idioma)} → {fechaLarga(datos.fecha_salida, idioma)}
          </p>
        </div>
        {total != null && (
          <p className="text-sm text-ink/60">
            {registrados}/{total}
          </p>
        )}
      </div>
      {total != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pctReserva} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pctReserva}%` }} />
        </div>
      )}
      {datos.nombres_registrados.length > 0 && (
        <p className="mt-3 text-xs text-ink/50">
          {t.yaRegistrados}: {datos.nombres_registrados.join(", ")}
        </p>
      )}
    </section>
  );

  if (completo) {
    return (
      <Marco {...marco}>
        {cabeceraEstancia}
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="text-3xl" aria-hidden>✓</p>
          <p className="mt-2 font-display text-xl font-semibold text-emerald-900">{t.completo}</p>
          <p className="mt-1 text-sm text-emerald-900/70">{t.completoSub}</p>
        </div>
      </Marco>
    );
  }

  // ---- Formulario ----------------------------------------------------------
  return (
    <Marco {...marco}>
      {cabeceraEstancia}

      {recienRegistrado && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">✓ {t.registrado(recienRegistrado)} {faltan != null && t.faltan(faltan)}</p>
          <p className="mt-1 text-emerald-900/70">{t.reutilizar}</p>
        </div>
      )}

      <section className="mt-6 rounded-xl border border-line bg-white">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <p className="font-display text-lg font-semibold">{t.huespedDe(registrados + 1, total)}</p>
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
            if (paso < 3) siguiente();
            else enviar();
          }}
        >
          {paso === 0 && (
            <>
              <Campo id="nombre" etiqueta={t.nombre} error={errores.nombre}>
                <input id="nombre" autoComplete="given-name" value={h.nombre} onChange={(e) => cambiar("nombre", e.target.value)} />
              </Campo>
              <Campo id="apellido1" etiqueta={t.apellido1} error={errores.apellido1}>
                <input id="apellido1" autoComplete="family-name" value={h.apellido1} onChange={(e) => cambiar("apellido1", e.target.value)} />
              </Campo>
              <Campo id="nacionalidad" etiqueta={t.nacionalidad} error={errores.nacionalidad_codigo}>
                <SelectPais id="nacionalidad" valor={h.nacionalidad_codigo} paises={paises} placeholder={t.elige} onChange={(v) => cambiar("nacionalidad_codigo", v)} />
              </Campo>
              <Campo
                id="apellido2"
                etiqueta={t.apellido2}
                opcional={h.nacionalidad_codigo !== "ESP" ? t.opcional : undefined}
                ayuda={h.nacionalidad_codigo !== "ESP" ? t.apellido2Ayuda : undefined}
                error={errores.apellido2}
              >
                <input id="apellido2" value={h.apellido2} onChange={(e) => cambiar("apellido2", e.target.value)} />
              </Campo>
              <Campo id="sexo" etiqueta={t.sexo} error={errores.sexo_codigo}>
                <Botones
                  nombre="sexo"
                  valor={h.sexo_codigo}
                  opciones={(datos.sexos ?? []).map((s) => ({ valor: s.codigo, etiqueta: SEXOS[s.codigo]?.[idioma] ?? s.descripcion ?? s.codigo }))}
                  onChange={(v) => cambiar("sexo_codigo", v)}
                />
              </Campo>
              <Campo id="fecha_nacimiento" etiqueta={t.fechaNac} error={errores.fecha_nacimiento}>
                <input
                  id="fecha_nacimiento"
                  type="date"
                  autoComplete="bday"
                  max={new Date().toISOString().slice(0, 10)}
                  value={h.fecha_nacimiento}
                  onChange={(e) => cambiar("fecha_nacimiento", e.target.value)}
                />
              </Campo>
            </>
          )}

          {paso === 1 && (
            <>
              <Campo id="tipo_documento" etiqueta={t.tipoDoc} ayuda={t.tipoDocAyuda} error={errores.tipo_documento_codigo}>
                <Botones
                  nombre="tipo_documento"
                  vertical
                  valor={h.tipo_documento_codigo}
                  opciones={ORDEN_DOC.filter((c) => datos.tipos_documento?.some((d) => d.codigo === c)).map((c) => ({
                    valor: c,
                    etiqueta: TIPOS_DOC[c]?.[idioma] ?? c,
                  }))}
                  onChange={(v) => cambiar("tipo_documento_codigo", v)}
                />
              </Campo>
              <Campo id="numero_documento" etiqueta={t.numDoc} error={errores.numero_documento}>
                <input
                  id="numero_documento"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={h.numero_documento}
                  onChange={(e) => cambiar("numero_documento", e.target.value)}
                />
              </Campo>
              {(h.tipo_documento_codigo === "NIF" || h.tipo_documento_codigo === "NIE") && (
                <Campo id="soporte_documento" etiqueta={t.soporte} ayuda={t.soporteAyuda} error={errores.soporte_documento}>
                  <input
                    id="soporte_documento"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    value={h.soporte_documento}
                    onChange={(e) => cambiar("soporte_documento", e.target.value)}
                  />
                </Campo>
              )}
            </>
          )}

          {paso === 2 && (
            <>
              <Campo id="pais" etiqueta={t.paisRes} error={errores.pais_codigo}>
                <SelectPais id="pais" valor={h.pais_codigo} paises={paises} placeholder={t.elige} onChange={(v) => cambiar("pais_codigo", v)} />
              </Campo>
              <Campo id="direccion" etiqueta={t.direccion} error={errores.direccion}>
                <input id="direccion" autoComplete="street-address" value={h.direccion} onChange={(e) => cambiar("direccion", e.target.value)} />
              </Campo>
              <Campo id="codigo_postal" etiqueta={t.cp} error={errores.codigo_postal}>
                <input id="codigo_postal" autoComplete="postal-code" value={h.codigo_postal} onChange={(e) => cambiar("codigo_postal", e.target.value)} />
              </Campo>
              {h.pais_codigo === "ESP" ? (
                <Campo id="municipio" etiqueta={t.municipio} error={errores.codigo_municipio_ref}>
                  <BuscadorMunicipio
                    token={token}
                    seleccionado={h.municipio_texto}
                    placeholder={t.municipioBuscar}
                    onElegir={(codigo, nombre) => {
                      cambiar("codigo_municipio_ref", codigo);
                      cambiar("municipio_texto", nombre);
                    }}
                  />
                </Campo>
              ) : (
                <Campo id="nombre_municipio" etiqueta={t.ciudad} error={errores.nombre_municipio}>
                  <input id="nombre_municipio" autoComplete="address-level2" value={h.nombre_municipio} onChange={(e) => cambiar("nombre_municipio", e.target.value)} />
                </Campo>
              )}
            </>
          )}

          {paso === 3 && (
            <>
              <Campo id="parentesco" etiqueta={t.parentesco} ayuda={t.parentescoAyuda} error={errores.parentesco_codigo}>
                <select id="parentesco" value={h.parentesco_codigo} onChange={(e) => cambiar("parentesco_codigo", e.target.value)}>
                  <option value="">{t.elige}</option>
                  {Object.entries(PARENTESCOS)
                    .filter(([c]) => datos.parentescos?.some((p) => p.codigo === c))
                    .map(([c, n]) => (
                      <option key={c} value={c}>
                        {n[idioma]}
                      </option>
                    ))}
                </select>
              </Campo>
              <Campo id="telefono" etiqueta={t.telefono} error={errores.telefono}>
                <input id="telefono" type="tel" autoComplete="tel" inputMode="tel" placeholder="+34 600 000 000" value={h.telefono} onChange={(e) => cambiar("telefono", e.target.value)} />
              </Campo>
              <Campo id="correo" etiqueta={t.correo} error={errores.correo}>
                <input id="correo" type="email" autoComplete="email" inputMode="email" value={h.correo} onChange={(e) => cambiar("correo", e.target.value)} />
              </Campo>
              <Campo id="motivo" etiqueta={t.motivo} error={errores.motivo_viaje}>
                <select id="motivo" value={h.motivo_viaje} onChange={(e) => cambiar("motivo_viaje", e.target.value)}>
                  <option value="">{t.elige}</option>
                  {MOTIVOS.map((m) => (
                    <option key={m} value={m}>
                      {idioma === "es" ? m.split(" / ")[0].replace(/\.$/, "") : (m.split(" / ")[1] ?? m)}
                    </option>
                  ))}
                </select>
              </Campo>

              <div className="rounded-lg border border-line bg-paper p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/50">{t.privacidad}</p>
                <button type="button" onClick={() => setVerPrivacidad((v) => !v)} className="mt-1 text-xs text-ink/60 underline">
                  {t.privacidadLeer}
                </button>
                {verPrivacidad && <p className="mt-2 text-xs leading-relaxed text-ink/70">{PRIVACIDAD[idioma]}</p>}
                <label className="!mb-0 mt-3 flex items-start gap-2.5 !text-sm !font-normal !text-ink">
                  <input
                    type="checkbox"
                    className="!mt-0.5 !w-auto shrink-0"
                    checked={h.consentimiento}
                    onChange={(e) => cambiar("consentimiento", e.target.checked)}
                  />
                  <span>{t.acepto}</span>
                </label>
                {errores.consentimiento && <p className="mt-1 text-xs text-clay">{errores.consentimiento}</p>}
              </div>
            </>
          )}

          {errorEnvio && <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{errorEnvio}</p>}

          <div className="flex items-center justify-between gap-3 pt-2">
            {paso > 0 ? (
              <button type="button" onClick={() => irA(paso - 1)} className="rounded-md px-3 py-2.5 text-sm text-ink/60 hover:text-ink">
                ← {t.atras}
              </button>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={enviando}
              className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
            >
              {paso < 3 ? `${t.siguiente} →` : enviando ? t.enviando : t.enviar}
            </button>
          </div>
        </form>
      </section>
    </Marco>
  );
}

// --- Piezas -------------------------------------------------------------------

// Marco de la página (fuera del componente principal para que los campos no
// se vuelvan a crear —y pierdan el foco— en cada pulsación).
function Marco({
  idioma,
  setIdioma,
  titulo,
  refArriba,
  children,
}: {
  idioma: Idioma;
  setIdioma: (i: Idioma) => void;
  titulo: string;
  refArriba: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-xl px-4 pb-16 pt-6 sm:pt-10" ref={refArriba}>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo-botones.jpg" alt="Botones" width={36} height={36} className="rounded" />
            <span className="font-display text-lg font-semibold">{titulo}</span>
          </div>
          <div className="flex overflow-hidden rounded-md border border-line text-xs">
            {(["es", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setIdioma(l)}
                aria-pressed={idioma === l}
                className={`px-2.5 py-1.5 font-medium ${idioma === l ? "bg-ink text-paper" : "bg-white text-ink/60"}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

function Campo({
  id,
  etiqueta,
  ayuda,
  opcional,
  error,
  children,
}: {
  id: string;
  etiqueta: string;
  ayuda?: string;
  opcional?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id}>
        {etiqueta}
        {opcional && <span className="ml-1 font-normal text-ink/40">({opcional})</span>}
      </label>
      {children}
      {ayuda && !error && <p className="mt-1 text-xs text-ink/50">{ayuda}</p>}
      {error && (
        <p className="mt-1 text-xs text-clay" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Botones({
  nombre,
  valor,
  opciones,
  onChange,
  vertical,
}: {
  nombre: string;
  valor: string;
  opciones: { valor: string; etiqueta: string }[];
  onChange: (v: string) => void;
  vertical?: boolean;
}) {
  return (
    <div role="radiogroup" id={nombre} className={vertical ? "grid gap-2" : "flex flex-wrap gap-2"}>
      {opciones.map((o) => {
        const activo = valor === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onChange(o.valor)}
            className={`rounded-md border px-3.5 py-2.5 text-left text-sm transition ${
              activo ? "border-ink bg-ink text-paper" : "border-line bg-white text-ink hover:border-ink/40"
            }`}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

function SelectPais({
  id,
  valor,
  paises,
  placeholder,
  onChange,
}: {
  id: string;
  valor: string;
  paises: { top: Opcion[]; resto: Opcion[] };
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <select id={id} value={valor} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      <optgroup label="—">
        {paises.top.map((p) => (
          <option key={p.codigo} value={p.codigo}>
            {p.codigo === "ESP" ? "España / Spain" : p.nombre}
          </option>
        ))}
      </optgroup>
      <optgroup label="A–Z">
        {paises.resto.map((p) => (
          <option key={p.codigo} value={p.codigo}>
            {p.nombre}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

function BuscadorMunicipio({
  token,
  seleccionado,
  placeholder,
  onElegir,
}: {
  token: string;
  seleccionado: string;
  placeholder: string;
  onElegir: (codigo: string, nombre: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState(seleccionado);
  const [resultados, setResultados] = useState<{ codigo: string; nombre: string }[]>([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => setQ(seleccionado), [seleccionado]);

  useEffect(() => {
    if (!abierto || q.trim().length < 2 || q === seleccionado) {
      setResultados([]);
      return;
    }
    const temporizador = setTimeout(async () => {
      const { data } = await supabase.rpc("formulario_municipios", { p_token: token, p_q: q });
      setResultados((data as { codigo: string; nombre: string }[]) ?? []);
    }, 250);
    return () => clearTimeout(temporizador);
  }, [q, abierto, seleccionado, supabase, token]);

  return (
    <div className="relative">
      <input
        id="municipio"
        role="combobox"
        aria-expanded={resultados.length > 0}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={q}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
          if (seleccionado) onElegir("", "");
        }}
      />
      {abierto && resultados.length > 0 && (
        <ul role="listbox" className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-white shadow-lg">
          {resultados.map((m) => {
            const [provincia, ...resto] = m.nombre.split("-");
            const municipio = resto.join("-") || provincia;
            return (
              <li key={m.codigo}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onElegir(m.codigo, m.nombre);
                    setResultados([]);
                    setAbierto(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-paper"
                >
                  {municipio}
                  {resto.length > 0 && <span className="ml-1 text-ink/50">· {provincia}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
