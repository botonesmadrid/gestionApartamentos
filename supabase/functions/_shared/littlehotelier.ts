// Lectura de los correos de Little Hotelier (channel manager de Casa Malasaña) para reservas de Booking.com.
//   Asunto: "Booking.com Booking for # 6751820633 for Gatti, Elisabetta, Arriving 20-Nov-2026"
//           "Booking.com Modification for # …"   /   "Booking.com Cancellation for # …"
//   Cuerpo: Check-in/Check-out (dd-Mon-yyyy) · Booking Confirmation Id · Guest Count (adultos y niños por edad)
//           · Total Price · Commission Payable · Guest · desglose diario con el Room Id · tasas (suplemento de limpieza)
// Importe con comisión = Total Price + suplemento(s) de limpieza; la comisión viene en "Commission Payable".
// El correo trae los datos de la tarjeta virtual: quitarDatosPago() los elimina antes de guardar nada.

export type TipoAviso = "alta" | "modificacion" | "cancelacion";

export interface AvisoLittleHotelier {
  tipo: TipoAviso | null;
  portal: string | null;
  codigo: string | null;
  cliente: string | null;
  room_id: string | null;
  habitaciones: number; // nº de Room Id distintos (esperamos 1)
  entrada: string | null; // YYYY-MM-DD
  salida: string | null;
  adultos: number | null;
  ninos: number | null;
  precio_total: number | null; // importe con comisión (Total Price + limpieza)
  comision: number | null;
  limpieza: number | null;
}

const MESES: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  ene: "01", abr: "04", ago: "08", dic: "12",
};

function fecha(v: string | undefined): string | null {
  const m = v?.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  return mes ? `${m[3]}-${mes}-${m[1].padStart(2, "0")}` : null;
}

const numero = (v: string | undefined) => {
  if (!v) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Quita del texto los datos de pago (tarjeta, CVC, caducidad) para poder guardarlo. */
export function quitarDatosPago(texto: string): string {
  return texto
    .replace(/PAYMENT DETAILS[\s\S]*?(?=To ensure your guest data|$)/i, "PAYMENT DETAILS [datos de pago eliminados] ")
    .replace(/(Credit Card Number|CVC|Expiry)\s*:\s*[^|\n]*/gi, "$1: [eliminado]");
}

export function leerAvisoLittleHotelier(asunto: string, texto: string): AvisoLittleHotelier {
  const t = texto.replace(/\s+/g, " ");
  const a = asunto.replace(/\s+/g, " ");

  const tipo: TipoAviso | null = /cancel/i.test(a) || /Reservation Cancell?ation/i.test(t)
    ? "cancelacion"
    : /modif/i.test(a) || /Reservation Modification/i.test(t)
      ? "modificacion"
      : /Booking for|New Reservation/i.test(`${a} ${t}`)
        ? "alta"
        : null;

  const codigo = t.match(/Booking Confirmation Id\s*:?\s*\|?\s*([A-Za-z0-9-]+)/i)?.[1] ?? a.match(/#\s*([A-Za-z0-9-]+)/)?.[1] ?? null;
  const portal = /^Booking\.com/i.test(a) ? "Booking" : (a.match(/^([A-Za-z.]+)\s/)?.[1] ?? null);

  // Huésped: "Guest: Nombre Apellido | Age:"; si no, el asunto "for Apellido, Nombre, Arriving".
  let cliente = t.match(/Guest\s*:\s*\|?\s*([^|]+?)\s*\|?\s*Age\s*:/i)?.[1]?.trim() ?? null;
  if (!cliente) {
    const s = a.match(/for\s+((?:(?!for\s)[^,#])+),\s*([^,]+),\s*Arriving/i);
    if (s) cliente = `${s[2].trim()} ${s[1].trim()}`;
  }

  // Fechas: la cabecera "Check-in: 20-Nov-2026 Check-out: 24-Nov-2026".
  const entrada = fecha(t.match(/Check-in\s*:?\s*\|?\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i)?.[1]);
  const salida = fecha(t.match(/Check-out\s*:?\s*\|?\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i)?.[1]);

  // Personas: primer "Guest Count" (el de la reserva).
  const gc = t.match(/Guest Count\s*:\s*(.*?)(?=\| \||Total Price|Guest\s*:|$)/i)?.[1] ?? "";
  const adultos = numero(gc.match(/Number of adults\s*:\s*(\d+)/i)?.[1]);
  let ninos: number | null = null;
  for (const m of gc.matchAll(/Number of child(?:ren)?[^:]*:\s*(\d+)/gi)) ninos = (ninos ?? 0) + Number(m[1]);

  const total = numero(t.match(/Total Price\s*:\s*([\d.,]+)\s*EUR/i)?.[1]);
  const comision = numero(t.match(/Commission Payable\s*:\s*([\d.,]+)\s*EUR/i)?.[1]);
  let limpieza: number | null = null;
  for (const m of t.matchAll(/(?:limpieza|cleaning)[^|]*?\|?\s*([\d.,]+)\s*EUR/gi)) limpieza = (limpieza ?? 0) + (numero(m[1]) ?? 0);

  // Room Id: en el desglose diario "20-Nov-2026 | 243422302 | 13960789 | …".
  const rooms = new Set<string>();
  for (const m of t.matchAll(/\d{1,2}-[A-Za-z]{3}-\d{4}\s*\|?\s*(\d{6,})\s*\|?\s*\d+/g)) rooms.add(m[1]);

  return {
    tipo,
    portal,
    codigo,
    cliente,
    room_id: [...rooms][0] ?? null,
    habitaciones: rooms.size || (tipo === "cancelacion" ? 1 : 0),
    entrada,
    salida,
    adultos,
    ninos,
    precio_total: total != null ? Math.round((total + (limpieza ?? 0)) * 100) / 100 : null,
    comision,
    limpieza,
  };
}
