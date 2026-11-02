// Cálculos del Reporting (informe anual de KPIs y análisis), compartidos por la pantalla y la presentación.
// Réplica del informe trimestral del gestor: los datos salen de v_reporting_estancias (reservas de la app +
// histórico del Sheet), agrupados por mes de entrada.

import type { SupabaseClient } from "@supabase/supabase-js";

export type Estancia = {
  cliente_id: string;
  cliente: string;
  pisos_ocupacion: number;
  piso: string | null;
  entrada: string;
  salida: string | null;
  noches: number;
  precio: number | null;
  comision_portal: number | null;
  canal: string;
  fecha_reserva: string | null;
  cuenta_ocupacion: boolean;
  anio: number;
  mes: number;
};

export const CANALES = ["Airbnb", "Booking", "Tripadvisor", "Vrbo", "Web propia", "Spotahome/PlumGuide", "Directo", "Otros"];
export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Colores: categóricos en orden fijo (paleta validada) y gris neutro para "Otros" y para el año anterior.
export const COLOR_ACTUAL = "#2a78d6";
export const COLOR_ANTERIOR = "#a8a69f";
export const COLORES_CANAL: Record<string, string> = {
  Airbnb: "#2a78d6",
  Booking: "#eb6834",
  Tripadvisor: "#1baf7a",
  Vrbo: "#eda100",
  "Web propia": "#e87ba4",
  "Spotahome/PlumGuide": "#008300",
  Directo: "#6250d6",
  Otros: "#a8a69f",
};

export async function cargarEstancias(supabase: SupabaseClient, anios: number[], clienteId: string | null): Promise<Estancia[]> {
  const desde = `${Math.min(...anios)}-01-01`;
  const hasta = `${Math.max(...anios)}-12-31`;
  const filas: Estancia[] = [];
  for (let i = 0; ; i += 1000) {
    let q = supabase
      .from("v_reporting_estancias")
      .select("cliente_id, cliente, pisos_ocupacion, piso, entrada, salida, noches, precio, comision_portal, canal, fecha_reserva, cuenta_ocupacion, anio, mes")
      .gte("entrada", desde)
      .lte("entrada", hasta)
      .order("entrada")
      .range(i, i + 999);
    if (clienteId) q = q.eq("cliente_id", clienteId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    filas.push(...((data as Estancia[]) ?? []));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

export type Mes = {
  mes: number;
  reservas: number;
  ingresos: number;
  nochesOcupadas: number;
  nochesDisponibles: number;
  ocupacion: number | null; // 0-1
  precioNoche: number | null;
  valorMedioReserva: number | null;
  canales: Record<string, { reservas: number; ingresos: number }>;
};

export type Anual = {
  anio: number;
  pisos: number;
  meses: Mes[];
  totalSiguiente: number; // reservas del año siguiente (columna "2027" del informe)
  futuro?: Futuro | null; // "Valor Res. Canales futuro" informado a mano para el año
  futuroSiguiente?: number | null; // total informado a mano para el año siguiente
};

// "Valor Res. Canales futuro": canal → importe de cada mes (12 posiciones).
export type Futuro = Record<string, number[]>;
export const totalFuturoMes = (f: Futuro, i: number) => Object.values(f).reduce((s, v) => s + (Number(v[i]) || 0), 0);

export async function cargarFuturo(supabase: SupabaseClient, clienteId: string, anios: number[]): Promise<Record<number, Futuro>> {
  const { data, error } = await supabase
    .from("reporting_futuro")
    .select("anio, mes, canal, importe")
    .eq("cliente_id", clienteId)
    .in("anio", anios);
  if (error) throw new Error(error.message);
  const out: Record<number, Futuro> = {};
  for (const r of data ?? []) {
    const f = (out[r.anio] ??= {});
    (f[r.canal] ??= Array(12).fill(0))[r.mes - 1] = Number(r.importe) || 0;
  }
  return out;
}

// Sugerencia: media, por mes y canal, de los ingresos de los últimos 5 años con datos del cliente.
export function sugerirFuturo(estancias: Estancia[], anio: number): Futuro {
  const anios = [1, 2, 3, 4, 5].map((n) => anio - n).filter((a) => estancias.some((e) => e.anio === a));
  const f: Futuro = Object.fromEntries(CANALES.map((c) => [c, Array(12).fill(0)]));
  if (!anios.length) return f;
  for (const e of estancias) {
    if (!anios.includes(e.anio)) continue;
    const c = CANALES.includes(e.canal) ? e.canal : "Otros";
    f[c][e.mes - 1] += (Number(e.precio) || 0) / anios.length;
  }
  for (const c of CANALES) f[c] = f[c].map((v) => Math.round(v * 100) / 100);
  return f;
}

const diasMes = (anio: number, mes: number) => new Date(anio, mes, 0).getDate();

// Pisos que cuentan para la ocupación: los del cliente elegido o la suma de los clientes con estancias.
export function pisosDe(estancias: Estancia[], clienteId: string | null): number {
  const porCliente = new Map<string, number>();
  for (const e of estancias) if (!clienteId || e.cliente_id === clienteId) porCliente.set(e.cliente_id, Number(e.pisos_ocupacion) || 1);
  return Array.from(porCliente.values()).reduce((s, n) => s + n, 0) || 1;
}

export function calcularAnual(estancias: Estancia[], anio: number, pisos: number): Anual {
  const meses: Mes[] = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    reservas: 0,
    ingresos: 0,
    nochesOcupadas: 0,
    nochesDisponibles: diasMes(anio, i + 1) * pisos,
    ocupacion: null,
    precioNoche: null,
    valorMedioReserva: null,
    canales: Object.fromEntries(CANALES.map((c) => [c, { reservas: 0, ingresos: 0 }])),
  }));
  let totalSiguiente = 0;
  for (const e of estancias) {
    const precio = Number(e.precio) || 0;
    if (e.anio === anio + 1) totalSiguiente += precio;
    if (e.anio !== anio) continue;
    const m = meses[e.mes - 1];
    m.reservas += 1;
    m.ingresos += precio;
    if (e.cuenta_ocupacion) m.nochesOcupadas += Number(e.noches) || 0;
    const c = m.canales[CANALES.includes(e.canal) ? e.canal : "Otros"];
    c.reservas += 1;
    c.ingresos += precio;
  }
  for (const m of meses) {
    m.ocupacion = m.nochesDisponibles ? m.nochesOcupadas / m.nochesDisponibles : null;
    m.precioNoche = m.nochesOcupadas ? m.ingresos / m.nochesOcupadas : null;
    m.valorMedioReserva = m.reservas ? m.ingresos / m.reservas : null;
  }
  return { anio, pisos, meses, totalSiguiente };
}

// "Valor reservas a futuro" del mes m (como el informe): suma de la tabla "Valor Res. Canales futuro" de los
// meses siguientes del año; en diciembre, lo del año siguiente. Sin tabla informada, se usan las reservas registradas.
export function valorFuturo(a: Anual, mes: number): number {
  if (a.futuro && Object.keys(a.futuro).length) {
    if (mes === 12) return a.futuroSiguiente ?? a.totalSiguiente;
    let s = 0;
    for (let i = mes; i < 12; i++) s += totalFuturoMes(a.futuro, i);
    return s;
  }
  const resto = a.meses.slice(mes).reduce((s, m) => s + m.ingresos, 0);
  return mes === 12 ? a.totalSiguiente : resto;
}

const media = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

export type Trimestre = {
  t: number;
  ingresos: number;
  reservas: number;
  nochesOcupadas: number;
  ocupacionMedia: number | null;
  precioNocheMedio: number | null;
  valorMedioReserva: number | null; // media de los valores medios mensuales (como el informe)
  canales: Record<string, { reservas: number; ingresos: number }>;
};

export function calcularTrimestre(a: Anual, t: number): Trimestre {
  const ms = a.meses.slice((t - 1) * 3, t * 3);
  const canales = Object.fromEntries(
    CANALES.map((c) => [c, { reservas: ms.reduce((s, m) => s + m.canales[c].reservas, 0), ingresos: ms.reduce((s, m) => s + m.canales[c].ingresos, 0) }]),
  );
  return {
    t,
    ingresos: ms.reduce((s, m) => s + m.ingresos, 0),
    reservas: ms.reduce((s, m) => s + m.reservas, 0),
    nochesOcupadas: ms.reduce((s, m) => s + m.nochesOcupadas, 0),
    ocupacionMedia: media(ms.map((m) => m.ocupacion)),
    precioNocheMedio: media(ms.map((m) => m.precioNoche)),
    valorMedioReserva: media(ms.map((m) => m.valorMedioReserva)),
    canales,
  };
}

// Análisis de entradas: estancia media y antelación media de reserva por mes.
export function analisisEntradas(estancias: Estancia[], anio: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const es = estancias.filter((e) => e.anio === anio && e.mes === i + 1);
    const conAntelacion = es.filter((e) => e.fecha_reserva);
    const antelacion = conAntelacion.length
      ? conAntelacion.reduce((s, e) => s + (Date.parse(e.entrada) - Date.parse(e.fecha_reserva!)) / 86400000, 0) / conAntelacion.length
      : null;
    return {
      mes: i + 1,
      reservas: es.length,
      estanciaMedia: es.length ? es.reduce((s, e) => s + (Number(e.noches) || 0), 0) / es.length : null,
      antelacion,
      comision: es.reduce((s, e) => s + (Number(e.comision_portal) || 0), 0),
    };
  });
}

// Formato español con separador de miles siempre (8.100 €), también por debajo de 10.000.
const miles = (n: number, d: number) => {
  const [ent, dec] = Math.abs(n).toFixed(d).split(".");
  return (n < 0 ? "-" : "") + ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dec ? `,${dec}` : "");
};
export const eur0 = (n: number | null | undefined) => (n == null ? "—" : `${miles(Number(n), 0)} €`);
export const eur2 = (n: number | null | undefined) => (n == null ? "—" : `${miles(Number(n), 2)} €`);
export const pct = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : `${(n * 100).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
export const signo = (n: number | null | undefined, f: (x: number) => string) => (n == null ? "—" : `${n > 0 ? "+" : ""}${f(n)}`);
