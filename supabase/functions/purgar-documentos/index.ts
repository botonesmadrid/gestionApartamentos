// Edge Function: borra los documentos con datos de huéspedes que han superado el plazo de conservación (3 años desde el
// fin de la estancia, art. 5 del RD 933/2021), fuera de la base de datos (la base de datos la limpia
// public.purgar_datos_caducados()):
//   1. Google Drive, por los identificadores guardados en la entrada (carpeta, contrato, contrato firmado, XML de SES).
//   2. Google Drive, recorriendo la estructura de cada cliente: <raíz>/CONTRATOS DE ALQUILER <año>/<MM>.- <MES>/<DD>_…
//      (cubre las entradas antiguas sin identificadores). Las carpetas van por fecha de ENTRADA, así que se deja un
//      margen de 60 días para estancias largas.
//   3. Google Calendar: los eventos de esas entradas.
//   4. Gmail: avisos de Avirato, Little Hotelier y Dropbox Sign, y los formularios enviados a los huéspedes.
// Todo va a la papelera (Drive y Gmail la vacían solos a los 30 días), así que hay margen para recuperar un error.
//
// La llama pg_cron a diario con la cabecera x-cron-secret (comprobada contra Vault, como avisos-avirato).
// ?simulacion=1 no borra nada: solo cuenta lo que borraría (sin nombres, para no sacar datos personales).
// Gmail necesita el permiso gmail.modify en el OAuth de Google; sin él esa parte se salta y se indica "sin_permiso".
// Es autónoma (no usa _shared/google.ts) para poder desplegarla sola; usa el mismo OAuth de hola@botonesmadrid.com.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

async function tokenGoogle(): Promise<string> {
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

class Google {
  constructor(private token: string) {}
  async req(url: string, init: RequestInit = {}) {
    const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) } });
    if (!r.ok) throw new Error(`Google ${init.method ?? "GET"} ${url.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r;
  }
  async papelera(id: string) {
    await this.req(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
  }
}

const ANOS_CONSERVACION = 3;
const MARGEN_DIAS_ENTRADA = 60;
const MAX_RESERVAS = 50; // por pasada (el resto, al día siguiente)
const MAX_CORREOS = 100; // por consulta y pasada
const FOLDER = "application/vnd.google-apps.folder";

const CONSULTAS_GMAIL = [
  'from:noreply@avirato.com subject:"Id reserva"',
  'from:no-reply@app.littlehotelier.com subject:"Booking.com"',
  "from:noreply@mail.hellosign.com (subject:firmó OR subject:signed)",
  'in:sent subject:"Registro de huéspedes / Guest registration"',
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const menosDias = (fecha: string, dias: number) => {
  const d = new Date(fecha + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return iso(d);
};
const ultimoDiaMes = (anio: number, mes: number) => iso(new Date(Date.UTC(anio, mes, 0)));

type Resumen = {
  simulacion: boolean;
  corte_salida: string;
  corte_entrada_carpetas: string;
  drive_por_entrada: { entradas: number; archivos: number };
  drive_por_estructura: { clientes: number; carpetas_anio_revisadas: number; carpetas_anio: number; carpetas_mes: number; carpetas_dia: number };
  permisos: { drive: boolean; calendario: boolean; gmail_borrar: boolean };
  calendario: { eventos: number; estado: string };
  gmail: { correos: number; estado: string };
  errores: string[];
};

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: autorizado } = await db.rpc("verificar_secreto_cron", { p: req.headers.get("x-cron-secret") ?? "" });
  if (autorizado !== true) return new Response("forbidden", { status: 403 });

  const simulacion = new URL(req.url).searchParams.get("simulacion") === "1";
  const hoy = iso(new Date());
  const corte = `${Number(hoy.slice(0, 4)) - ANOS_CONSERVACION}${hoy.slice(4)}`; // misma fecha hace 3 años
  const corteEntrada = menosDias(corte, MARGEN_DIAS_ENTRADA);
  const r: Resumen = {
    simulacion,
    corte_salida: corte,
    corte_entrada_carpetas: corteEntrada,
    drive_por_entrada: { entradas: 0, archivos: 0 },
    drive_por_estructura: { clientes: 0, carpetas_anio_revisadas: 0, carpetas_anio: 0, carpetas_mes: 0, carpetas_dia: 0 },
    permisos: { drive: false, calendario: false, gmail_borrar: false },
    calendario: { eventos: 0, estado: "ok" },
    gmail: { correos: 0, estado: "ok" },
    errores: [],
  };

  let token: string;
  try {
    token = await tokenGoogle();
  } catch (e) {
    return Response.json({ error: "google", detalle: String(e).slice(0, 300) }, { status: 502 });
  }
  const g = new Google(token);

  // Permisos del OAuth de Google (para saber qué partes pueden funcionar).
  try {
    const info = await (await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`)).json();
    const scopes = String(info.scope ?? "").split(" ");
    r.permisos = {
      drive: scopes.some((x) => x.endsWith("/auth/drive") || x.endsWith("/auth/drive.file")),
      calendario: scopes.some((x) => x.endsWith("/auth/calendar") || x.endsWith("/auth/calendar.events")),
      gmail_borrar: scopes.some((x) => x.endsWith("/auth/gmail.modify") || x === "https://mail.google.com/"),
    };
  } catch (_) { /* sin información de permisos: se intenta igual */ }

  // Papelera de Drive; un archivo que ya no existe (404) cuenta como hecho.
  const papelera = async (id: string) => {
    if (simulacion) return true;
    try {
      await g.papelera(id);
      return true;
    } catch (e) {
      if (String(e).includes(": 404")) return true;
      r.errores.push(`drive ${id}: ${String(e).slice(0, 150)}`);
      return false;
    }
  };
  const subcarpetas = async (padre: string) => {
    const q = `'${padre}' in parents and mimeType='${FOLDER}' and trashed=false`;
    const l = await (await g.req(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    )).json();
    return (l.files ?? []) as { id: string; name: string }[];
  };

  // 1 y 3. Documentos y eventos guardados en las entradas.
  try {
    const { data: viejas, error } = await db
      .from("reservas")
      .select("id, contrato_carpeta_id, contrato_pdf_id, contrato_firmado_pdf_id, ses_xml_id, calendario_evento_id")
      .lt("fecha_salida", corte)
      .or("contrato_carpeta_id.not.is.null,contrato_pdf_id.not.is.null,contrato_firmado_pdf_id.not.is.null,ses_xml_id.not.is.null,calendario_evento_id.not.is.null")
      .limit(MAX_RESERVAS);
    if (error) throw error;
    // Una carpeta compartida con una entrada que aún está en plazo (p. ej. entrada duplicada) no se borra.
    const carpetas = [...new Set((viejas ?? []).map((v) => v.contrato_carpeta_id).filter(Boolean))] as string[];
    const enUso = new Set<string>();
    if (carpetas.length) {
      const { data: vivas } = await db.from("reservas").select("contrato_carpeta_id").in("contrato_carpeta_id", carpetas).gte("fecha_salida", corte);
      (vivas ?? []).forEach((v) => enUso.add(v.contrato_carpeta_id));
    }
    let calendarioActivo = true;
    for (const v of viejas ?? []) {
      let ok = true;
      for (const id of [v.contrato_pdf_id, v.contrato_firmado_pdf_id, v.ses_xml_id]) {
        if (!id) continue;
        ok = (await papelera(id)) && ok;
        r.drive_por_entrada.archivos++;
      }
      if (v.contrato_carpeta_id && !enUso.has(v.contrato_carpeta_id)) {
        ok = (await papelera(v.contrato_carpeta_id)) && ok;
        r.drive_por_entrada.archivos++;
      }
      let eventoBorrado = !v.calendario_evento_id;
      if (v.calendario_evento_id && calendarioActivo) {
        r.calendario.eventos++;
        if (!simulacion) {
          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(v.calendario_evento_id)}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.ok || res.status === 404 || res.status === 410) eventoBorrado = true;
          else if (res.status === 403) {
            calendarioActivo = false;
            r.calendario.estado = "sin_permiso";
          } else r.errores.push(`calendario: ${res.status}`);
        }
      }
      r.drive_por_entrada.entradas++;
      if (!simulacion && ok) {
        await db.from("reservas").update({
          contrato_carpeta_id: null, contrato_pdf_id: null, contrato_firmado_pdf_id: null, ses_xml_id: null,
          ...(eventoBorrado ? { calendario_evento_id: null, calendario_sync: null } : {}),
        }).eq("id", v.id);
      }
    }
  } catch (e) {
    r.errores.push(`entradas: ${String(e).slice(0, 200)}`);
  }

  // 2. Estructura de carpetas de cada cliente (por fecha de entrada, con margen).
  try {
    const { data: clientes } = await db.from("clientes").select("drive_carpeta_id").not("drive_carpeta_id", "is", null);
    const [ca, cm] = [Number(corteEntrada.slice(0, 4)), Number(corteEntrada.slice(5, 7))];
    for (const c of clientes ?? []) {
      r.drive_por_estructura.clientes++;
      for (const anio of await subcarpetas(c.drive_carpeta_id)) {
        const a = Number(anio.name.match(/^CONTRATOS DE ALQUILER (\d{4})$/)?.[1]);
        if (a) r.drive_por_estructura.carpetas_anio_revisadas++;
        if (!a || a > ca) continue;
        if (a < ca) {
          if (await papelera(anio.id)) r.drive_por_estructura.carpetas_anio++;
          continue;
        }
        for (const mes of await subcarpetas(anio.id)) {
          const m = Number(mes.name.match(/^(\d{2})\.- /)?.[1]);
          if (!m || m > cm) continue;
          if (ultimoDiaMes(a, m) < corteEntrada) {
            if (await papelera(mes.id)) r.drive_por_estructura.carpetas_mes++;
            continue;
          }
          for (const dia of await subcarpetas(mes.id)) {
            const d = dia.name.match(/^(\d{2})_/)?.[1];
            if (d && `${a}-${String(m).padStart(2, "0")}-${d}` < corteEntrada) {
              if (await papelera(dia.id)) r.drive_por_estructura.carpetas_dia++;
            }
          }
        }
      }
    }
  } catch (e) {
    r.errores.push(`estructura drive: ${String(e).slice(0, 200)}`);
  }

  // 4. Gmail.
  const antes = corte.replaceAll("-", "/");
  for (const consulta of CONSULTAS_GMAIL) {
    if (r.gmail.estado !== "ok") break;
    try {
      const l = await (await g.req(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAX_CORREOS}&q=${encodeURIComponent(`${consulta} before:${antes}`)}`,
      )).json();
      for (const m of (l.messages ?? []) as { id: string }[]) {
        if (!simulacion) {
          const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}/trash`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 403) {
            r.gmail.estado = "sin_permiso";
            break;
          }
          if (!res.ok) {
            r.errores.push(`gmail: ${res.status}`);
            continue;
          }
        }
        r.gmail.correos++;
      }
    } catch (e) {
      r.errores.push(`gmail: ${String(e).slice(0, 150)}`);
    }
  }

  console.log("purgar-documentos:", JSON.stringify(r));
  return Response.json(r);
});
