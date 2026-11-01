// Lectura de los avisos por correo de Avirato (channel manager).
//
// Formato observado (asunto + cuerpo HTML con pares etiqueta/valor):
//   Asunto: "Nueva Reserva de Booking Id reserva:  6901947450"
//           "Nueva Modificación de Airbnb Id reserva:  HM8A8RBR4K"
//           "Nueva cancelacion de Booking Id reserva:  5791107474"
//   Cuerpo: Establecimiento · Numéro de reserva · Nombre del cliente · Tipo de Habitación ·
//           Régimen · Tarifa · Entrada · Salida · [Observaciones] · Email Cliente · Teléfono ·
//           Adultos · Niños · [Precio Total]   (las cancelaciones no traen Precio Total)
//
// El "Precio Total" es el importe NETO (con IVA, sin la comisión del portal).

export type TipoAviso = "alta" | "modificacion" | "cancelacion";

export interface AvisoAvirato {
  tipo: TipoAviso | null;
  portal: string | null; // "Booking", "Airbnb", …
  codigo: string | null;
  cliente: string | null;
  habitacion: string | null; // sin el prefijo "1 x "
  habitaciones: number; // nº de habitaciones del aviso (esperamos 1)
  entrada: string | null; // YYYY-MM-DD
  salida: string | null;
  telefono: string | null;
  email: string | null;
  adultos: number | null;
  ninos: number | null;
  tarifa: string | null;
  regimen: string | null;
  observaciones: string | null;
  precio_total: number | null;
}

const ETIQUETAS: { clave: string; re: RegExp }[] = [
  { clave: "establecimiento", re: /Establecimiento/ },
  { clave: "codigo", re: /N[uú]m[eé]ro de reserva/ },
  { clave: "cliente", re: /Nombre del cliente/ },
  { clave: "habitacion", re: /Tipo de Habitaci[oó]n/ },
  { clave: "regimen", re: /R[eé]gimen/ },
  { clave: "tarifa", re: /Tarifa/ },
  { clave: "entrada", re: /Entrada/ },
  { clave: "salida", re: /Salida/ },
  { clave: "observaciones", re: /Observaciones/ },
  { clave: "email", re: /Email Cliente/ },
  { clave: "telefono", re: /Tel[eé]fono/ },
  { clave: "adultos", re: /Adultos/ },
  { clave: "ninos", re: /Ni[nñ]os/ },
  { clave: "precio", re: /Precio Total/ },
  { clave: "_fin", re: /¿Necesita ayuda\?|Por favor, no responda/ },
];

const ENTIDADES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", euro: "€",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ",
  uuml: "ü", iquest: "¿", iexcl: "¡", ordf: "ª", ordm: "º",
};

/** Convierte HTML (o el texto/markdown que da Gmail) en una sola línea de texto plano. */
export function aTextoPlano(cuerpo: string): string {
  return cuerpo
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n] ?? m)
    .replace(/[|#]|-{3,}/g, " ") // restos de tablas/markdown
    .replace(/\s+/g, " ")
    .trim();
}

function fecha(v: string | null): string | null {
  if (!v) return null;
  let m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function importe(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/[\d.,]+/);
  if (!m) return null;
  let s = m[0];
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // 1.115,10
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function entero(v: string | null): number | null {
  const m = v?.match(/\d+/);
  return m ? Number(m[0]) : null;
}

const vacio = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function leerAvisoAvirato(asunto: string, cuerpo: string): AvisoAvirato {
  const texto = aTextoPlano(cuerpo);

  // Tipo y portal: del asunto, o si no de la cabecera del cuerpo.
  const cab =
    `${asunto} ${texto.slice(0, 400)}`.match(
      /nueva\s+(reserva|modificaci[oó]n|cancelaci[oó]n)\s+(?:de|desde)\s+([A-Za-zÀ-ÿ.]+)/i,
    );
  const tipoTxt = cab?.[1].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const tipo: TipoAviso | null =
    tipoTxt === "reserva" ? "alta"
    : tipoTxt === "modificacion" ? "modificacion"
    : tipoTxt === "cancelacion" ? "cancelacion"
    : null;

  // Pares etiqueta → valor, recorriendo las etiquetas en orden (algunas son opcionales).
  const inicio = texto.search(/Establecimiento/);
  const encontrados: { clave: string; desde: number; hasta: number }[] = [];
  let cursor = Math.max(inicio, 0);
  for (const e of ETIQUETAS) {
    const resto = texto.slice(cursor);
    const m = resto.match(e.re);
    if (!m || m.index === undefined) continue;
    const desde = cursor + m.index;
    encontrados.push({ clave: e.clave, desde, hasta: desde + m[0].length });
    cursor = desde + m[0].length;
  }
  const v: Record<string, string | undefined> = {};
  encontrados.forEach((e, i) => {
    if (e.clave === "_fin") return;
    const fin = encontrados[i + 1]?.desde ?? texto.length;
    v[e.clave] = texto.slice(e.hasta, fin).trim();
  });

  const hab = vacio(v.habitacion);
  const mHab = hab?.match(/^(\d+)\s*x\s*(.+)$/i);
  const asuntoCodigo = asunto.match(/Id reserva:\s*(\S+)/i)?.[1] ?? null;

  return {
    tipo,
    portal: cab ? cab[2].replace(/\.$/, "") : null,
    codigo: vacio(v.codigo) ?? asuntoCodigo,
    cliente: vacio(v.cliente),
    habitacion: mHab ? mHab[2].trim() : hab,
    habitaciones: mHab ? Number(mHab[1]) : hab ? 1 : 0,
    entrada: fecha(vacio(v.entrada)),
    salida: fecha(vacio(v.salida)),
    telefono: vacio(v.telefono?.replace(/[^\d+]/g, "")),
    email: vacio(v.email),
    adultos: entero(vacio(v.adultos)),
    ninos: entero(vacio(v.ninos)),
    tarifa: vacio(v.tarifa),
    regimen: vacio(v.regimen),
    observaciones: vacio(v.observaciones),
    precio_total: importe(vacio(v.precio)),
  };
}
