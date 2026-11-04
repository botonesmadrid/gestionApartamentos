// Edge Function: envía una entrada a Google Calendar (calendario principal de la cuenta de Google de la app).
// Evento de día completo de la entrada a la salida (las noches), con el piso, el cliente y el titular.
// Si el evento ya existe se actualiza; si la entrada está cancelada se quita del calendario.
// Guarda en la reserva el id del evento y los datos enviados (calendario_sync) para saber si está al día.
// La llama la app con la sesión del gestor. Cuerpo: { reserva_id }
// Necesita el permiso https://www.googleapis.com/auth/calendar.events en el OAuth de Google (si no: "sin_permiso").
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { tokenGoogle } from "../_shared/google.ts";

const CALENDARIO = "primary";
const APP = "https://gestion-apartamentos-nine.vercel.app";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: esGestor } = await db.rpc("es_gestor");
  if (esGestor !== true) return json({ error: "no_autorizado" }, 403);

  const { reserva_id } = await req.json().catch(() => ({}));
  const { data: r, error } = await db
    .from("reservas")
    .select(`id, estado, nombre, apellido1, fecha_entrada, fecha_salida, num_huespedes, codigo_reserva, apartamento_id,
      calendario_evento_id, origenes_reserva(nombre), apartamentos(piso, clientes(codigo, nombre))`)
    .eq("id", reserva_id ?? "")
    .single();
  if (error || !r) return json({ error: "reserva", detalle: error?.message }, 404);

  const t = await tokenGoogle();
  const cal = (ruta: string, init: RequestInit = {}) =>
    fetch(`https://www.googleapis.com/calendar/v3/calendars/${CALENDARIO}/events${ruta}`, {
      ...init,
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  const fallo = async (res: Response) => {
    const txt = await res.text();
    if (res.status === 403 && /insufficient|SCOPE/i.test(txt)) return json({ error: "sin_permiso" }, 403);
    if (res.status === 403 && /has not been used|disabled/i.test(txt)) return json({ error: "api_desactivada" }, 403);
    return json({ error: "google", detalle: `${res.status} ${txt.slice(0, 300)}` }, 502);
  };

  // Cancelada: se quita del calendario.
  if (r.estado === "cancelada") {
    if (r.calendario_evento_id) {
      const res = await cal(`/${encodeURIComponent(r.calendario_evento_id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404 && res.status !== 410) return await fallo(res);
    }
    await db.from("reservas").update({ calendario_evento_id: null, calendario_sync: null, calendario_sincronizado_at: new Date().toISOString() }).eq("id", r.id);
    return json({ ok: true, quitado: true });
  }

  const apto: any = r.apartamentos;
  const cliente = apto?.clientes?.codigo ?? apto?.clientes?.nombre ?? "";
  const titular = [r.nombre, r.apellido1].filter(Boolean).join(" ");
  const evento = {
    summary: `${[cliente, apto?.piso].filter(Boolean).join(" ")} · ${titular}${r.num_huespedes ? ` (${r.num_huespedes})` : ""}`,
    description: [
      `Entrada: ${fecha(r.fecha_entrada)} · Salida: ${fecha(r.fecha_salida)}`,
      r.num_huespedes ? `Huéspedes: ${r.num_huespedes}` : null,
      (r as any).origenes_reserva?.nombre ? `Origen: ${(r as any).origenes_reserva.nombre}` : null,
      r.codigo_reserva ? `Código: ${r.codigo_reserva}` : null,
      `App: ${APP}`,
    ].filter(Boolean).join("\n"),
    start: { date: r.fecha_entrada },
    end: { date: r.fecha_salida }, // día completo: el final no se incluye (las noches de la estancia)
    transparency: "transparent",
    extendedProperties: { private: { reserva_id: r.id } },
  };

  let res: Response | null = null;
  if (r.calendario_evento_id) {
    res = await cal(`/${encodeURIComponent(r.calendario_evento_id)}`, { method: "PATCH", body: JSON.stringify(evento) });
    if (res.status === 404 || res.status === 410) res = null; // borrado en Calendar: se vuelve a crear
  }
  if (!res) res = await cal("", { method: "POST", body: JSON.stringify(evento) });
  if (!res.ok) return await fallo(res);
  const creado = await res.json();

  await db.from("reservas").update({
    calendario_evento_id: creado.id,
    calendario_sync: {
      entrada: r.fecha_entrada,
      salida: r.fecha_salida,
      nombre: titular,
      apartamento_id: r.apartamento_id,
      num_huespedes: r.num_huespedes,
    },
    calendario_sincronizado_at: new Date().toISOString(),
  }).eq("id", r.id);

  return json({ ok: true, evento_id: creado.id, enlace: creado.htmlLink });
});
