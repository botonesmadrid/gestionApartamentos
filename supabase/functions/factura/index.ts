// Edge Function: PDF de una factura (con el reporting de reservas del periodo) y envío por email.
//
// La llama la app con la sesión del gestor (JWT verificado por Supabase + comprobación es_gestor).
// Cuerpo: { id: uuid, accion: "pdf" | "enviar", para?: "a@b.com, c@d.com" }
//   - pdf: devuelve el PDF (application/octet-stream).
//   - enviar: lo envía desde hola@botonesmadrid.com (Gmail API) a "para" o, si no se indica, a los emails
//     de facturación del cliente, con el asunto y cuerpo de la plantilla (Administración → Facturación).
// Secretos: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import { LOGO_JPG_B64 } from "./logo.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const eur = (n: number | null | undefined) =>
  n == null ? "" : num(n) + " €";
// Formato español con separador de miles siempre (1.718,48), como en las facturas del Sheet.
const num = (n: number | null | undefined, d = 2) => {
  if (n == null || Number.isNaN(Number(n))) return "";
  const [ent, dec] = Math.abs(Number(n)).toFixed(d).split(".");
  return (Number(n) < 0 ? "-" : "") + ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dec ? `,${dec}` : "");
};
const ddmmyyyy = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
const periodoTexto = (desde: string | null, hasta: string | null) => {
  if (!desde) return "";
  const [a, m] = desde.split("-").map(Number);
  if (hasta && hasta.slice(0, 7) !== desde.slice(0, 7)) return `${ddmmyyyy(desde)} – ${ddmmyyyy(hasta)}`;
  return `${MESES[m - 1]} de ${a}`;
};

// Las fuentes estándar del PDF solo cubren Latin-1 (+ €): el resto de caracteres se sustituye.
const WIN_EXTRA = new Set(["€", "‚", "ƒ", "„", "…", "†", "‡", "ˆ", "‰", "Š", "‹", "Œ", "Ž", "‘", "’", "“", "”", "•", "–", "—", "˜", "™", "š", "›", "œ", "ž", "Ÿ"]);
const limpio = (s: unknown) =>
  Array.from(String(s ?? "").replace(/\r?\n/g, " "))
    .map((c) => (c.charCodeAt(0) <= 0xff || WIN_EXTRA.has(c) ? c : c.normalize("NFKD").replace(/[^\x00-\xff]/g, "") || "?"))
    .join("");

function partir(texto: string, font: PDFFont, size: number, ancho: number): string[] {
  // Respeta los saltos de línea del concepto y parte cada párrafo al ancho disponible.
  const lineas: string[] = [];
  for (const parrafo of String(texto ?? "").split(/\r?\n/)) {
    const palabras = limpio(parrafo).split(/\s+/).filter(Boolean);
    let actual = "";
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (font.widthOfTextAtSize(prueba, size) <= ancho) actual = prueba;
      else {
        if (actual) lineas.push(actual);
        actual = p;
      }
    }
    if (actual) lineas.push(actual);
  }
  return lineas.length ? lineas : [""];
}

const TINTA = rgb(0, 0, 0);
const GRIS = rgb(0.4, 0.4, 0.4);
const MARINO = rgb(0, 0.125, 0.376); // #002060, como las facturas del Sheet
const AZUL_CLARO = rgb(0.6, 0.682, 0.82);
const BLANCO = rgb(1, 1, 1);
const eurFactura = (n: number | null | undefined) => (n == null ? "" : `${num(n)} €`);

async function construirPdf(f: any, lineas: any[], conf: any, reporting: any[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Factura ${f.numero}`);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const neg = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedJpg(Uint8Array.from(atob(LOGO_JPG_B64), (c) => c.charCodeAt(0)));
  const M = 50;
  let page: PDFPage = pdf.addPage([595.28, 841.89]);
  const W = page.getWidth();
  let y = 790;
  const t = (s: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: any; derecha?: boolean; centro?: boolean } = {}) => {
    const size = o.size ?? 10;
    const font = o.font ?? reg;
    const txt = limpio(s);
    const ancho = font.widthOfTextAtSize(txt, size);
    const xx = o.derecha ? x - ancho : o.centro ? x - ancho / 2 : x;
    page.drawText(txt, { x: xx, y: yy, size, font, color: o.color ?? TINTA });
  };

  // Cabecera: datos del cliente (izquierda) y logo (derecha).
  page.drawImage(logo, { x: W - M - 95, y: y - 70, width: 95, height: 95 });
  const datos = [
    `Cliente / Client:  ${f.destinatario_nombre ?? ""}`,
    `CIF/NIF/NIE: ${f.destinatario_nif ?? ""}`,
    ...partir(`Direccion / Address: ${f.destinatario_direccion ?? ""}`, neg, 9.5, 340),
    `Invoice Number ${f.numero}`,
    `Invoice Date: ${ddmmyyyy(f.fecha)}`,
  ];
  datos.forEach((l, i) => t(l, M, y - i * 15, { size: 9.5, font: neg }));
  y -= datos.length * 15 + 30;

  // Tabla de conceptos
  const cx = { concepto: M + 6, cant: 360, precio: 450, importe: W - M - 6 };
  const cabeceraTabla = () => {
    page.drawRectangle({ x: M, y: y - 22, width: W - 2 * M, height: 34, color: MARINO });
    t("INVOICE DETAILS", 190, y - 4, { size: 9, font: neg, color: BLANCO, centro: true });
    t("Services", cx.cant + 8, y - 4, { size: 9, color: BLANCO, derecha: true });
    t("Unit costs EUR", cx.precio + 20, y - 4, { size: 9, font: neg, color: BLANCO, derecha: true });
    t("Total (EUR)", cx.importe, y - 4, { size: 9, font: neg, color: BLANCO, derecha: true });
    y -= 50;
  };
  cabeceraTabla();
  const yInicioTabla = y + 28;
  for (const l of lineas) {
    const partes = partir(l.concepto, reg, 9.5, 280);
    if (y - partes.length * 13 < 200) {
      page.drawRectangle({ x: M, y: y, width: W - 2 * M, height: yInicioTabla - y, borderColor: TINTA, borderWidth: 0.6 });
      page = pdf.addPage([595.28, 841.89]);
      y = 790;
      cabeceraTabla();
    }
    // Los importes van en la última línea del concepto (como en el Sheet).
    partes.forEach((p, i) => t(p, cx.concepto, y - i * 13, { size: 9.5 }));
    const yImporte = y - (partes.length - 1) * 13;
    t(Number(l.cantidad).toLocaleString("es-ES", { maximumFractionDigits: 2 }), cx.cant, yImporte, { size: 9.5, derecha: true });
    t(num(l.precio), cx.precio + 20, yImporte, { size: 9.5, derecha: true });
    t(eurFactura(l.importe), cx.importe, yImporte, { size: 9.5, derecha: true });
    y -= partes.length * 13 + 7;
  }
  y = Math.min(y, yInicioTabla - 150);
  page.drawRectangle({ x: M, y: y, width: W - 2 * M, height: yInicioTabla - y, borderColor: TINTA, borderWidth: 0.6 });

  // Totales
  const filaTotal = (k: string, v: string, o: { fondo?: any; blanco?: boolean; negrita?: boolean; alto?: number } = {}) => {
    const alto = o.alto ?? 16;
    if (o.fondo) page.drawRectangle({ x: M, y: y - alto, width: W - 2 * M, height: alto, color: o.fondo });
    const color = o.blanco ? BLANCO : TINTA;
    const font = o.negrita ? neg : reg;
    t(k, M + 4, y - alto + 4.5, { size: 9, font, color });
    t(v, W - M - 6, y - alto + 4.5, { size: 9, font, color, derecha: true });
    y -= alto;
  };
  filaTotal("TOTAL NETO // TOTAL NET COSTS", eurFactura(f.base), { negrita: true });
  page.drawLine({ start: { x: M, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 1, color: TINTA });
  y -= 4;
  filaTotal("IRPF", Number(f.irpf) ? eurFactura(f.irpf) : "", { negrita: true, alto: 20 });
  filaTotal(`${num(f.iva_pct, 0)}%IVA // VAT`, eurFactura(f.iva));
  page.drawLine({ start: { x: M, y: y }, end: { x: W - M, y: y }, thickness: 1, color: TINTA });
  filaTotal("TOTAL  SUMA", eurFactura(f.total), { fondo: AZUL_CLARO, blanco: true, negrita: true });
  y -= 3;
  filaTotal("TOTAL  FACTURA", eurFactura(f.total), { fondo: MARINO, blanco: true, negrita: true, alto: 18 });

  // Pago y pie con los datos de Botones
  y -= 40;
  if (conf?.iban) {
    t(`Bank details for payments: ${conf.banco ?? ""}`, M, y, { size: 10, font: neg });
    t(conf.iban, M, y - 16, { size: 10, font: neg });
    y -= 50;
  }
  const pie = [conf?.emisor_nombre, conf?.emisor_direccion, conf?.emisor_nif ? `NIF- ${conf.emisor_nif}` : ""].filter(Boolean).join(" / ");
  partir(pie, reg, 9.5, W - 2 * M).forEach((l, i) => t(l, M, y - i * 13, { size: 9.5 }));

  // Reporting: detalle de reservas del periodo.
  if (reporting.length) {
    page = pdf.addPage([841.89, 595.28]); // apaisado
    const W2 = page.getWidth();
    y = 545;
    t(`Detalle de reservas · ${periodoTexto(f.periodo_desde, f.periodo_hasta)}`, M, y, { size: 14, font: neg });
    t(`Factura ${f.numero} · ${f.destinatario_nombre ?? ""}`, W2 - M, y, { size: 9, color: GRIS, derecha: true });
    y -= 26;
    const cols: [string, number, boolean?][] = [
      ["Nº", M], ["Huésped", 115], ["Código", 290], ["Origen", 375], ["Piso", 430], ["Entrada", 480], ["Salida", 535],
      ["Noches", 600, true], ["Precio", 665, true], ["Comisión", 725, true], ["Sin comisión", W2 - M, true],
    ];
    const cab = () => {
      page.drawRectangle({ x: M - 4, y: y - 5, width: W2 - 2 * M + 8, height: 18, color: MARINO });
      for (const [k, x, d] of cols) t(k, x, y, { size: 8, font: neg, derecha: d, color: BLANCO });
      y -= 18;
    };
    cab();
    let tot = { noches: 0, precio: 0, comision: 0, sin: 0 };
    for (const r of reporting) {
      if (y < 60) {
        page = pdf.addPage([841.89, 595.28]);
        y = 545;
        cab();
      }
      const huesped = partir(r.motivo ?? "", reg, 8.5, 170)[0];
      const vals: [string, number, boolean?][] = [
        [r.numero ?? "", M], [huesped, 115], [r.codigo_reserva ?? "", 290], [r.origen_codigo ?? "", 375], [r.piso ?? "", 430],
        [ddmmyyyy(r.entrada), 480], [ddmmyyyy(r.salida), 535], [r.noches != null ? String(r.noches) : "", 600, true],
        [num(r.precio), 665, true], [num(r.comision_portal), 725, true], [num(r.precio_sin_comision), W2 - M, true],
      ];
      for (const [v, x, d] of vals) t(partir(v, reg, 8.5, 120)[0], x, y, { size: 8.5, derecha: d });
      tot = {
        noches: tot.noches + Number(r.noches || 0),
        precio: tot.precio + Number(r.precio || 0),
        comision: tot.comision + Number(r.comision_portal || 0),
        sin: tot.sin + Number(r.precio_sin_comision || 0),
      };
      y -= 13;
    }
    page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W2 - M, y: y + 9 }, thickness: 0.8, color: TINTA });
    y -= 4;
    t(`${reporting.length} reservas`, M, y, { size: 9, font: neg });
    t(String(tot.noches), 600, y, { size: 9, font: neg, derecha: true });
    t(num(tot.precio), 665, y, { size: 9, font: neg, derecha: true });
    t(num(tot.comision), 725, y, { size: 9, font: neg, derecha: true });
    t(num(tot.sin), W2 - M, y, { size: 9, font: neg, derecha: true });
  }
  return await pdf.save();
}

async function tokenGmail(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GMAIL_CLIENT_ID")!,
      client_secret: Deno.env.get("GMAIL_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GMAIL_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`OAuth Google: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}
const bytesB64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64 = (s: string) => bytesB64(new TextEncoder().encode(s));
const b64url = (s: string) => b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const cabeceraUtf8 = (s: string) => `=?UTF-8?B?${b64(s)}?=`;
const lineas76 = (s: string) => s.replace(/(.{76})/g, "$1\r\n");
const rellenar = (plantilla: string, v: Record<string, string>) =>
  plantilla.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => v[k] ?? "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const jwt = req.headers.get("Authorization") ?? "";
  const usuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: jwt } },
    auth: { persistSession: false },
  });
  const { data: esGestor } = await usuario.rpc("es_gestor");
  if (esGestor !== true) return json({ error: "no_autorizado" }, 403);

  let cuerpo: { id?: string; accion?: string; para?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "cuerpo" }, 400);
  }

  const { data: f, error } = await usuario.from("facturas").select("*").eq("id", cuerpo.id ?? "").single();
  if (error || !f) return json({ error: "factura" }, 404);
  const [{ data: lineas }, { data: conf }, { data: cliente }] = await Promise.all([
    usuario.from("facturas_lineas").select("*").eq("factura_id", f.id).order("orden"),
    usuario.from("configuracion_facturacion").select("*").eq("id", 1).maybeSingle(),
    f.cliente_id
      ? usuario.from("clientes").select("codigo, nombre, emails_facturacion").eq("id", f.cliente_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  let reporting: any[] = [];
  if (f.cliente_id && f.periodo_desde && f.periodo_hasta && f.origen === "app") {
    const { data } = await usuario
      .from("v_ingresos")
      .select("numero, motivo, codigo_reserva, origen_codigo, piso, entrada, salida, noches, precio, comision_portal, precio_sin_comision")
      .eq("cliente_id", f.cliente_id)
      .eq("servicio", "Checkin")
      .gte("entrada", f.periodo_desde)
      .lte("entrada", f.periodo_hasta)
      .order("entrada");
    reporting = data ?? [];
  }

  let pdf: Uint8Array;
  try {
    pdf = await construirPdf(f, lineas ?? [], conf, reporting);
  } catch (e) {
    console.error("factura pdf:", e);
    return json({ error: "pdf", detalle: String(e) }, 500);
  }
  const nombreArchivo = `Factura_${f.numero}.pdf`;

  if (cuerpo.accion !== "enviar") {
    return new Response(pdf, {
      headers: { ...CORS, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${nombreArchivo}"` },
    });
  }

  if (f.estado !== "emitida") return json({ error: "no_emitida" }, 409);
  const para = (cuerpo.para?.trim() || cliente?.emails_facturacion || "")
    .split(/[,;\s]+/)
    .map((x: string) => x.trim())
    .filter(Boolean);
  if (!para.length) return json({ error: "sin_destinatarios" }, 400);
  if (para.some((x: string) => !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(x))) return json({ error: "email_invalido" }, 400);

  const vars = {
    numero: f.numero,
    periodo: periodoTexto(f.periodo_desde, f.periodo_hasta),
    total: eur(f.total),
    destinatario: f.destinatario_nombre ?? "",
    cliente: cliente?.nombre ?? "",
    fecha: ddmmyyyy(f.fecha),
  };
  const asunto = rellenar(conf?.plantilla_asunto || "Factura {{numero}}", vars);
  const texto = rellenar(conf?.plantilla_cuerpo || "Adjuntamos la factura {{numero}}.", vars);

  const frontera = `b_${crypto.randomUUID()}`;
  const mensaje = [
    `To: ${para.join(", ")}`,
    `Subject: ${cabeceraUtf8(asunto)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${frontera}"`,
    "",
    `--${frontera}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    lineas76(b64(texto)),
    `--${frontera}`,
    `Content-Type: application/pdf; name="${nombreArchivo}"`,
    `Content-Disposition: attachment; filename="${nombreArchivo}"`,
    "Content-Transfer-Encoding: base64",
    "",
    lineas76(bytesB64(pdf)),
    `--${frontera}--`,
  ].join("\r\n");

  try {
    const token = await tokenGmail();
    const g = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64url(mensaje) }),
    });
    if (!g.ok) {
      const detalle = await g.text();
      console.error("Gmail send:", g.status, detalle);
      return json({ error: "gmail", status: g.status, detalle: detalle.slice(0, 300) }, 502);
    }
  } catch (e) {
    console.error("factura enviar:", e);
    return json({ error: "gmail", detalle: String(e) }, 502);
  }

  await usuario.from("facturas").update({ enviada_at: new Date().toISOString(), enviada_a: para.join(", ") }).eq("id", f.id);
  return json({ ok: true, para });
});
