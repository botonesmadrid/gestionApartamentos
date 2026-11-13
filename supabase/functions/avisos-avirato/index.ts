// Edge Function: lee de Gmail los avisos de Avirato y los aplica a las reservas.
//
// Se ejecuta cada pocos minutos (pg_cron → net.http_post). Solo lectura sobre Gmail
// (scope gmail.readonly); qué correos ya se procesaron se guarda en public.avisos_canal.
//
// Secretos necesarios (supabase secrets set …):
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN  → OAuth "Interna" de Google Workspace
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.
// La llamada programada envía la cabecera x-cron-secret, que se comprueba contra Vault
// (public.verificar_secreto_cron); el secreto no sale de la base de datos.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { aTextoPlano, leerAvisoAvirato } from "../_shared/avirato.ts";
import { leerFirmaHelloSign } from "../_shared/hellosign.ts";
import { leerAvisoLittleHotelier, quitarDatosPago } from "../_shared/littlehotelier.ts";
import { Google, limpiarNombre, normalizar, titularDe } from "../_shared/google.ts";

// Correos de firma completada de Dropbox Sign (HelloSign): el correo es lo único que marca un contrato como firmado;
// su PDF adjunto se guarda en la carpeta de la reserva. Desde septiembre de 2026 llegan a este buzón (los de
// septiembre-octubre se incorporaron el 3/11/2026 para las entradas de octubre y noviembre sin el PDF en la carpeta).
const CONSULTA_FIRMAS = 'from:noreply@mail.hellosign.com (subject:firmó OR subject:signed) has:attachment after:2026/09/01';
const FIRMAS_POR_PASADA = 10; // para no agotar el tiempo de la función; el resto, en la siguiente pasada

const CONSULTA = 'from:noreply@avirato.com subject:"Id reserva" newer_than:30d';
// Little Hotelier (Casa Malasaña): reservas, modificaciones y cancelaciones de Booking.com. Desde el 4/11/2026.
const CONSULTA_LH = 'from:no-reply@app.littlehotelier.com subject:"Booking.com" after:2026/11/04';

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

async function gmail(token: string, ruta: string) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Gmail ${ruta}: ${r.status} ${await r.text()}`);
  return r.json();
}

function base64url(data: string): string {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// Devuelve el cuerpo HTML si existe; si no, el texto plano.
function cuerpoDe(payload: any): string {
  const partes: any[] = [];
  const recorrer = (p: any) => {
    partes.push(p);
    (p.parts ?? []).forEach(recorrer);
  };
  recorrer(payload);
  const html = partes.find((p) => p.mimeType === "text/html" && p.body?.data);
  const texto = partes.find((p) => p.mimeType === "text/plain" && p.body?.data);
  const elegido = html ?? texto;
  return elegido ? base64url(elegido.body.data) : "";
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: autorizado } = await db.rpc("verificar_secreto_cron", {
    p: req.headers.get("x-cron-secret") ?? "",
  });
  if (autorizado !== true) return new Response("forbidden", { status: 403 });

  try {
    const avisos = await procesar(db);
    // Little Hotelier: un fallo aquí tampoco debe impedir lo demás.
    const littleHotelier = await procesarLittleHotelier(db).catch((e) => ({ error: String(e).slice(0, 300) }));
    // Un fallo en las firmas (p. ej. Drive) no debe impedir aplicar los avisos de reservas.
    const firmas = await procesarFirmas(db).catch((e) => ({ error: String(e).slice(0, 300) }));
    return Response.json({ ...avisos, littleHotelier, firmas });
  } catch (e) {
    console.error("avisos-avirato:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});

// deno-lint-ignore no-explicit-any
async function procesar(db: any) {
  const token = await tokenGmail();
  const lista = await gmail(
    token,
    `messages?includeSpamTrash=true&maxResults=100&q=${encodeURIComponent(CONSULTA)}`,
  );
  const ids: string[] = (lista.messages ?? []).map((m: any) => m.id);
  if (ids.length === 0) return { procesados: 0 };

  const { data: yaVistos } = await db.from("avisos_canal").select("mensaje_id").in("mensaje_id", ids);
  const vistos = new Set((yaVistos ?? []).map((v) => v.mensaje_id));

  // Del más antiguo al más nuevo, para aplicar alta → modificación → cancelación en orden.
  const nuevos = ids.filter((id) => !vistos.has(id)).reverse();
  const resultados = [];
  for (const id of nuevos) {
    const m = await gmail(token, `messages/${id}?format=full`);
    const cabeceras = Object.fromEntries(
      (m.payload?.headers ?? []).map((h: any) => [h.name.toLowerCase(), h.value]),
    );
    const asunto = cabeceras["subject"] ?? "";
    const cuerpo = cuerpoDe(m.payload);
    const aviso = leerAvisoAvirato(asunto, cuerpo);
    const { data, error } = await db.rpc("registrar_aviso_canal", {
      p: {
        canal: "avirato",
        mensaje_id: id,
        recibido_at: new Date(Number(m.internalDate)).toISOString(),
        asunto,
        cuerpo: aTextoPlano(cuerpo), // texto limpio: suficiente para revisar o reprocesar
        ...aviso,
        // más de una habitación en un aviso: que lo revise una persona
        tipo: aviso.habitaciones === 1 ? aviso.tipo : "revisar",
      },
    });
    resultados.push({ id, codigo: aviso.codigo, resultado: error ? `error: ${error.message}` : data?.resultado });
  }

  return { procesados: resultados.length, resultados };
}

// ---------------------------------------------------------------------------
// Little Hotelier: mismos avisos que Avirato (registrar_aviso_canal). El piso se busca por el Room Id
// (apartamentos.room_id_canal) y la comisión viene desglosada, así que la entrada no queda pendiente de importe.
// El correo trae la tarjeta virtual (número y CVC): se quita antes de guardar el cuerpo.
// deno-lint-ignore no-explicit-any
async function procesarLittleHotelier(db: any) {
  const token = await tokenGmail();
  const lista = await gmail(token, `messages?includeSpamTrash=true&maxResults=100&q=${encodeURIComponent(CONSULTA_LH)}`);
  const ids: string[] = (lista.messages ?? []).map((m: any) => m.id);
  if (!ids.length) return { procesados: 0 };
  const { data: yaVistos } = await db.from("avisos_canal").select("mensaje_id").in("mensaje_id", ids);
  const vistos = new Set((yaVistos ?? []).map((v: any) => v.mensaje_id));
  const nuevos = ids.filter((id) => !vistos.has(id)).reverse();
  const resultados = [];
  for (const id of nuevos) {
    const m = await gmail(token, `messages/${id}?format=full`);
    const cab = Object.fromEntries((m.payload?.headers ?? []).map((h: any) => [h.name.toLowerCase(), h.value]));
    const asunto = cab["subject"] ?? "";
    const texto = quitarDatosPago(aTextoPlano(cuerpoDe(m.payload)));
    const aviso = leerAvisoLittleHotelier(asunto, texto);
    const { data, error } = await db.rpc("registrar_aviso_canal", {
      p: {
        canal: "littlehotelier",
        mensaje_id: id,
        recibido_at: new Date(Number(m.internalDate)).toISOString(),
        asunto,
        cuerpo: texto,
        ...aviso,
        // más de una habitación en un aviso: que lo revise una persona
        tipo: aviso.habitaciones <= 1 ? aviso.tipo : "revisar",
      },
    });
    resultados.push({ id, codigo: aviso.codigo, resultado: error ? `error: ${error.message}` : data?.resultado });
  }
  return { procesados: resultados.length, resultados };
}

// ---------------------------------------------------------------------------
// Firmas de HelloSign: guarda el PDF firmado en la carpeta de la reserva y marca el contrato.
// deno-lint-ignore no-explicit-any
async function procesarFirmas(db: any) {
  const token = await tokenGmail();
  const g = new Google(token);
  const { data: clientes } = await db.from("clientes").select("id, nombre, drive_carpeta_id");
  const resultados: any[] = [];

  // Firmas asignadas a mano desde Entradas (asignar_firma): falta guardar el PDF en la carpeta de la entrada.
  const { data: pendientes } = await db.from("avisos_canal")
    .select("id, mensaje_id, reserva_id").eq("canal", "hellosign").eq("datos->>pdf_pendiente", "true")
    .not("reserva_id", "is", null).limit(FIRMAS_POR_PASADA);
  for (const a of pendientes ?? []) {
    try {
      const m = await gmail(token, `messages/${a.mensaje_id}?format=full`);
      const pdf = adjuntoPdf(m.payload);
      const { data: r } = await db.from("reservas")
        .select(`id, nombre, apellido1, fecha_entrada, titular_huesped_id, contrato_carpeta_id,
          apartamentos(piso, cliente_id), huespedes!huespedes_reserva_id_fkey(id, created_at, nombre, apellido1, apellido2)`)
        .eq("id", a.reserva_id).single();
      const { data: av } = await db.from("avisos_canal").select("datos").eq("id", a.id).single();
      let detalle: string;
      if (!pdf) detalle = "asignada a mano; el correo no trae el PDF firmado";
      else if (!r) detalle = "asignada a mano; no se encuentra la entrada";
      else {
        const ok = await guardarPdfFirmado(db, g, clientes ?? [], a.mensaje_id, pdf.body.attachmentId, r, null);
        detalle = ok ? "asignada a mano; contrato firmado guardado en Drive" : "asignada a mano; el cliente no tiene carpeta de Drive configurada";
      }
      await db.from("avisos_canal").update({ detalle, datos: { ...(av?.datos ?? {}), pdf_pendiente: false } }).eq("id", a.id);
      resultados.push({ id: a.mensaje_id, resultado: "asignada", detalle });
    } catch (e) {
      console.error("firma asignada:", e);
      resultados.push({ id: a.mensaje_id, resultado: `error: ${String(e).slice(0, 200)}` }); // se reintenta en la siguiente pasada
    }
  }

  const lista = await gmail(token, `messages?includeSpamTrash=true&maxResults=200&q=${encodeURIComponent(CONSULTA_FIRMAS)}`);
  const ids: string[] = (lista.messages ?? []).map((m: any) => m.id);
  if (!ids.length) return { procesados: resultados.length, resultados };
  const { data: yaVistos } = await db.from("avisos_canal").select("mensaje_id").in("mensaje_id", ids);
  const vistos = new Set((yaVistos ?? []).map((v: any) => v.mensaje_id));
  const nuevos = ids.filter((id) => !vistos.has(id)).reverse().slice(0, FIRMAS_POR_PASADA);
  for (const id of nuevos) {
    const m = await gmail(token, `messages/${id}?format=full`);
    const cab = Object.fromEntries((m.payload?.headers ?? []).map((h: any) => [h.name.toLowerCase(), h.value]));
    const asunto = cab["subject"] ?? "";
    const cuerpo = cuerpoDe(m.payload);
    const firma = leerFirmaHelloSign(asunto, cuerpo);
    const recibido = new Date(Number(m.internalDate)).toISOString();
    const pdf = adjuntoPdf(m.payload);

    const registrar = async (resultado: string, detalle: string | null, reservaId: string | null) => {
      await db.from("avisos_canal").insert({
        canal: "hellosign", mensaje_id: id, recibido_at: recibido, asunto, cuerpo: aTextoPlano(cuerpo),
        datos: firma, resultado, detalle, reserva_id: reservaId, procesado_at: new Date().toISOString(),
      });
      resultados.push({ id, resultado, detalle });
    };

    if (!pdf) { await registrar("revisar", "el correo no trae el PDF firmado adjunto", null); continue; }

    // Cliente: por su nombre dentro del título del documento ("El Botones Barco …", "Casa Malasaña Madrid …").
    const titulo = normalizar(firma.titulo);
    const cliente = (clientes ?? []).find((c: any) =>
      normalizar(c.nombre).split(" ").filter((w: string) => w.length > 3).some((w: string) => titulo.includes(w)));

    // Candidatas: reservas confirmadas sin contrato firmado cuya estancia no había terminado al recibir el correo.
    const dia = 864e5, t0 = Number(m.internalDate);
    const desde = new Date(t0 - 10 * dia).toISOString().slice(0, 10);
    const hasta = new Date(t0 + 400 * dia).toISOString().slice(0, 10);
    let q = db.from("reservas")
      .select(`id, nombre, apellido1, fecha_entrada, titular_huesped_id, contrato_carpeta_id, contrato_generado_at,
        apartamentos!inner(piso, cliente_id), huespedes!huespedes_reserva_id_fkey(id, created_at, nombre, apellido1, apellido2, correo)`)
      .eq("estado", "confirmada").is("contrato_firmado_at", null).gte("fecha_salida", desde).lte("fecha_entrada", hasta);
    if (cliente) q = q.eq("apartamentos.cliente_id", cliente.id);
    const { data: candidatas } = await q;

    // El firmante coincide con una persona si contiene todas las palabras de su nombre y primer apellido (en cualquier orden).
    const palabrasFirmante = new Set(normalizar(firma.firmante).split(/[^a-z0-9]+/).filter(Boolean));
    const coincide = (nombre: string | null, apellido: string | null) => {
      const ps = normalizar([nombre, apellido].filter(Boolean).join(" ")).split(/[^a-z0-9]+/).filter(Boolean);
      return ps.length >= 2 && ps.every((p) => palabrasFirmante.has(p));
    };
    const puntuadas = (candidatas ?? []).map((r: any) => {
      const t = titularDe(r);
      let puntos = 0;
      if (firma.email && (r.huespedes ?? []).some((h: any) => normalizar(h.correo) === firma.email)) puntos += 10;
      if (coincide(r.nombre, r.apellido1) || (r.huespedes ?? []).some((h: any) => coincide(h.nombre, h.apellido1))) puntos += 6;
      const primerNombre = normalizar(r.nombre).split(" ")[0];
      if (primerNombre && (titulo.endsWith(primerNombre) || titulo.includes(` ${primerNombre}`))) puntos += 3;
      if (r.contrato_generado_at) puntos += 1;
      return { r, t, puntos };
    }).filter((x: any) => x.puntos >= 6).sort((a: any, b: any) => b.puntos - a.puntos);

    if (!puntuadas.length) { await registrar("revisar", `no se encuentra la reserva de «${firma.firmante}» (${firma.titulo})`, null); continue; }
    if (puntuadas.length > 1 && puntuadas[0].puntos === puntuadas[1].puntos) {
      await registrar("revisar", `varias reservas posibles para «${firma.firmante}»`, null); continue;
    }
    const { r } = puntuadas[0];
    try {
      const ok = await guardarPdfFirmado(db, g, clientes ?? [], id, pdf.body.attachmentId, r, recibido);
      if (!ok) { await registrar("revisar", "el cliente no tiene carpeta de Drive configurada", r.id); continue; }
      await registrar("actualizada", `contrato firmado guardado en Drive`, r.id);
    } catch (e) {
      console.error("firma HelloSign:", e);
      resultados.push({ id, resultado: `error: ${String(e).slice(0, 200)}` }); // se reintenta en la siguiente pasada
    }
  }
  return { procesados: resultados.length, resultados };
}

// deno-lint-ignore no-explicit-any
function adjuntoPdf(payload: any): any {
  const partes: any[] = [];
  const recorrer = (p: any) => { partes.push(p); (p.parts ?? []).forEach(recorrer); };
  recorrer(payload);
  return partes.find((p) => p.filename?.toLowerCase().endsWith(".pdf") && p.body?.attachmentId);
}

// Guarda el PDF firmado del correo en la carpeta de Drive de la entrada y marca el contrato como firmado.
// firmadoAt: fecha a guardar en contrato_firmado_at (null = no tocarla). Devuelve false si no hay carpeta.
// deno-lint-ignore no-explicit-any
async function guardarPdfFirmado(db: any, g: Google, clientes: any[], mensajeId: string, adjuntoId: string, r: any, firmadoAt: string | null) {
  const t = titularDe(r);
  const piso = String(r.apartamentos?.piso ?? "");
  const nombreCompleto = [t?.nombre ?? r.nombre, t?.apellido1 ?? r.apellido1, t?.apellido2].filter(Boolean).join("_");
  let carpeta = r.contrato_carpeta_id as string | null;
  const raiz = clientes.find((c: any) => c.id === r.apartamentos?.cliente_id)?.drive_carpeta_id;
  if (!carpeta && raiz) carpeta = await g.carpetaReserva(raiz, r.fecha_entrada, nombreCompleto, piso);
  if (!carpeta) return false;
  const datosPdf = await g.adjuntoGmail(mensajeId, adjuntoId);
  const nombrePdf = limpiarNombre(`Contrato_temporal_${piso}_${nombreCompleto}_FIRMADO`) + ".pdf";
  const subido = (await g.archivo(carpeta, nombrePdf)) ?? await g.subirPdf(nombrePdf, carpeta, datosPdf);
  await db.from("reservas").update({
    ...(firmadoAt ? { contrato_firmado_at: firmadoAt } : {}),
    contrato_firmado_pdf_id: subido.id,
    contrato_carpeta_id: carpeta,
  }).eq("id", r.id);
  return true;
}
