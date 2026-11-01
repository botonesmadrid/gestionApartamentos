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

const CONSULTA = 'from:noreply@avirato.com subject:"Id reserva" newer_than:30d';

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
    return Response.json(await procesar(db));
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
