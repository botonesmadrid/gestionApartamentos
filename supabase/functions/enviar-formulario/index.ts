// Edge Function: envía por email al titular el enlace del formulario de huéspedes,
// desde hola@botonesmadrid.com (Gmail API, scope gmail.send). El correo queda en "Enviados".
//
// La llama la app con la sesión del gestor (JWT verificado por Supabase + comprobación es_gestor).
// Cuerpo: { reserva_id: uuid, destinatario: string }
// Secretos: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN (con gmail.readonly + gmail.send).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

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

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};
const b64url = (s: string) => b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const cabeceraUtf8 = (s: string) => `=?UTF-8?B?${b64(s)}?=`;

function fecha(iso: string, locale: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

function escapar(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Cliente con la sesión del gestor: RLS y es_gestor() deciden qué puede ver.
  const jwt = req.headers.get("Authorization") ?? "";
  const usuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: jwt } },
    auth: { persistSession: false },
  });
  const { data: esGestor } = await usuario.rpc("es_gestor");
  if (esGestor !== true) return json({ error: "no_autorizado" }, 403);

  let cuerpo: { reserva_id?: string; destinatario?: string; origen?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "cuerpo" }, 400);
  }
  const destinatario = (cuerpo.destinatario ?? "").trim();
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(destinatario)) return json({ error: "email_invalido" }, 400);

  // El enlace se construye con el origen de la app desde la que se pide (https y mismo Origin).
  const origen = req.headers.get("Origin") ?? "";
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(origen) && !/^http:\/\/localhost(:\d+)?$/.test(origen)) {
    return json({ error: "origen" }, 400);
  }

  const { data: r, error } = await usuario
    .from("reservas")
    .select("id, nombre, fecha_entrada, fecha_salida, num_huespedes, formulario_token, estado")
    .eq("id", cuerpo.reserva_id ?? "")
    .single();
  if (error || !r) return json({ error: "reserva" }, 404);
  if (r.estado === "cancelada") return json({ error: "cancelada" }, 409);

  const enlace = `${origen}/f/${r.formulario_token}`;
  const nombre = String(r.nombre).split(" ")[0];
  const n = r.num_huespedes as number | null;
  const esFechas = `${fecha(r.fecha_entrada, "es-ES")} – ${fecha(r.fecha_salida, "es-ES")}`;
  const enFechas = `${fecha(r.fecha_entrada, "en-GB")} – ${fecha(r.fecha_salida, "en-GB")}`;

  const asunto = "Registro de huéspedes / Guest registration · El Botones Madrid";
  const texto =
    `Hola ${nombre}:\n\n` +
    `Para completar tu reserva (${esFechas}) necesitamos los datos de ${n ? `los ${n} huéspedes` : "todos los huéspedes"}. ` +
    `Es obligatorio por ley en España y son unos 2 minutos por persona:\n${enlace}\n\n` +
    `Hi ${nombre},\n\n` +
    `To complete your booking (${enFechas}) we need the details of ${n ? `all ${n} guests` : "all guests"}. ` +
    `It is required by Spanish law and takes about 2 minutes per person:\n${enlace}\n\n` +
    `Gracias / Thank you,\nEl Botones Madrid`;
  const boton = (t: string) =>
    `<p style="margin:20px 0"><a href="${enlace}" style="background:#1C2321;color:#F7F6F2;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${t}</a></p>`;
  const html =
    `<div style="font-family:Inter,Arial,sans-serif;color:#1C2321;max-width:560px;line-height:1.5">` +
    `<p>Hola ${escapar(nombre)}:</p>` +
    `<p>Para completar tu reserva (<strong>${esFechas}</strong>) necesitamos los datos de ${n ? `los <strong>${n} huéspedes</strong>` : "todos los huéspedes"}. Es obligatorio por ley en España y son unos 2 minutos por persona.</p>` +
    boton("Registrar huéspedes") +
    `<hr style="border:none;border-top:1px solid #DEDAD1;margin:24px 0">` +
    `<p>Hi ${escapar(nombre)},</p>` +
    `<p>To complete your booking (<strong>${enFechas}</strong>) we need the details of ${n ? `<strong>all ${n} guests</strong>` : "all guests"}. It is required by Spanish law and takes about 2 minutes per person.</p>` +
    boton("Register guests") +
    `<p style="color:#6b6b6b;font-size:13px">Si el botón no funciona / If the button doesn't work:<br><a href="${enlace}">${enlace}</a></p>` +
    `<p>Gracias / Thank you,<br>El Botones Madrid</p></div>`;

  const frontera = `b_${crypto.randomUUID()}`;
  const mensaje = [
    `To: ${destinatario}`,
    `Subject: ${cabeceraUtf8(asunto)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${frontera}"`,
    "",
    `--${frontera}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(texto),
    `--${frontera}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(html),
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
    console.error("enviar-formulario:", e);
    return json({ error: "gmail", detalle: String(e) }, 502);
  }

  await usuario.from("reservas").update({ formulario_enviado_at: new Date().toISOString() }).eq("id", r.id);
  return json({ ok: true });
});
