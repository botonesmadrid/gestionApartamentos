// Edge Function: sincroniza las entradas con Google Calendar (calendario principal de la cuenta de Google de la app).
//
// Cada entrada con piso asignado (no "SIN ASIGNAR") y titular informado tiene un evento de día completo en su fecha de
// entrada, con el color del cliente (clientes.color_calendario: el mismo que se usa en la app). Si la entrada se
// modifica, el evento se actualiza; si se cancela, se borra o deja de tener piso/titular, el evento se quita.
// El id del evento se deriva del id de la reserva, así que llamadas repetidas o simultáneas nunca duplican eventos.
// Guarda en la reserva el id del evento y los datos enviados (calendario_sync) para saber si está al día.
//
// Quién la llama (verify_jwt desactivado: la autorización se comprueba aquí):
//  - La base de datos (triggers de reservas/apartamentos/clientes, vía pg_net) y pg_cron, con la cabecera
//    x-cron-secret (comprobada contra Vault, como avisos-avirato).
//  - La app, con la sesión de un gestor (botón "Enviar a Google Calendar").
// Cuerpo:
//  { reserva_id }          sincroniza esa entrada
//  { evento_id }           quita ese evento (entrada borrada de la base de datos)
//  { pendientes: true }    sincroniza las entradas desde ayer en adelante que no estén al día (máx. MAX_PENDIENTES)
// Necesita el permiso https://www.googleapis.com/auth/calendar.events en el OAuth de Google (si no: "sin_permiso").
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { hoyMadrid, tokenGoogle } from "../_shared/google.ts";

const CALENDARIO = "primary";
const APP = "https://gestion-apartamentos-nine.vercel.app";
const MAX_PENDIENTES = 100;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const sumarDia = (iso: string, n: number) => {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Id de evento de Google: caracteres base32hex (0-9 a-v), 5-1024. El uuid sin guiones es hexadecimal: vale tal cual.
const idEvento = (reservaId: string) => reservaId.replace(/-/g, "").toLowerCase();

const SELECT = `id, estado, nombre, apellido1, fecha_entrada, fecha_salida, num_huespedes, codigo_reserva, apartamento_id,
  calendario_evento_id, calendario_sync, origenes_reserva(nombre), apartamentos(piso, clientes(codigo, nombre, color_calendario))`;

type Sync = { entrada: string; salida: string; nombre: string; apartamento_id: string; num_huespedes: number | null; color: number | null };

// deno-lint-ignore no-explicit-any
const titularDe = (r: any) => [r.nombre, r.apellido1].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
// Debe estar en Calendar: no cancelada, con piso asignado y con titular.
// deno-lint-ignore no-explicit-any
const debeEstar = (r: any) =>
  r.estado !== "cancelada" && !!r.apartamentos?.piso && r.apartamentos.piso !== "SIN ASIGNAR" && !!titularDe(r);
// deno-lint-ignore no-explicit-any
const syncDe = (r: any): Sync => ({
  entrada: r.fecha_entrada,
  salida: r.fecha_salida,
  nombre: titularDe(r),
  apartamento_id: r.apartamento_id,
  num_huespedes: r.num_huespedes ?? null,
  color: r.apartamentos?.clientes?.color_calendario ?? null,
});
// deno-lint-ignore no-explicit-any
const alDia = (r: any) => {
  if (!debeEstar(r)) return !r.calendario_evento_id;
  const s = r.calendario_sync as Sync | null;
  if (!r.calendario_evento_id || !s) return false;
  const e = syncDe(r);
  return s.entrada === e.entrada && s.salida === e.salida && s.nombre === e.nombre && s.apartamento_id === e.apartamento_id &&
    (s.num_huespedes ?? null) === e.num_huespedes && (s.color ?? null) === e.color;
};

class ErrorGoogle extends Error {
  constructor(public codigo: string, public detalle = "") {
    super(`${codigo} ${detalle}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const secreto = req.headers.get("x-cron-secret");
  if (secreto) {
    const { data: ok } = await db.rpc("verificar_secreto_cron", { p: secreto });
    if (ok !== true) return json({ error: "no_autorizado" }, 403);
  } else {
    const usuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: esGestor } = await usuario.rpc("es_gestor");
    if (esGestor !== true) return json({ error: "no_autorizado" }, 403);
  }

  const cuerpo = await req.json().catch(() => ({}));
  let token: string;
  try {
    token = await tokenGoogle();
  } catch (e) {
    return json({ error: "google", detalle: String(e).slice(0, 300) }, 502);
  }
  const cal = (ruta: string, init: RequestInit = {}) =>
    fetch(`https://www.googleapis.com/calendar/v3/calendars/${CALENDARIO}/events${ruta}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  const fallo = async (res: Response): Promise<never> => {
    const txt = await res.text();
    if (res.status === 403 && /insufficient|SCOPE/i.test(txt)) throw new ErrorGoogle("sin_permiso");
    if (res.status === 403 && /has not been used|disabled/i.test(txt)) throw new ErrorGoogle("api_desactivada");
    throw new ErrorGoogle("google", `${res.status} ${txt.slice(0, 300)}`);
  };
  const borrar = async (id: string) => {
    const res = await cal(`/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404 && res.status !== 410) await fallo(res);
  };

  // deno-lint-ignore no-explicit-any
  async function sincronizar(r: any) {
    const id = idEvento(r.id);
    // Evento antiguo con otro id (creado antes de usar ids fijos): se quita.
    if (r.calendario_evento_id && r.calendario_evento_id !== id) await borrar(r.calendario_evento_id);

    if (!debeEstar(r)) {
      await borrar(id);
      await db.from("reservas").update({
        calendario_evento_id: null,
        calendario_sync: null,
        calendario_sincronizado_at: new Date().toISOString(),
      }).eq("id", r.id);
      return { quitado: true };
    }

    const apto = r.apartamentos;
    const cli = apto.clientes;
    const s = syncDe(r);
    const noches = Math.round((new Date(r.fecha_salida).getTime() - new Date(r.fecha_entrada).getTime()) / 864e5);
    const evento = {
      id,
      status: "confirmed",
      summary: `${[cli?.codigo ?? cli?.nombre, apto.piso].filter(Boolean).join(" ")} · ${s.nombre}${r.num_huespedes ? ` (${r.num_huespedes})` : ""}`,
      description: [
        `Entrada: ${fecha(r.fecha_entrada)} · Salida: ${fecha(r.fecha_salida)} (${noches} ${noches === 1 ? "noche" : "noches"})`,
        cli?.nombre ? `Cliente: ${cli.nombre}` : null,
        r.num_huespedes ? `Huéspedes: ${r.num_huespedes}` : null,
        r.origenes_reserva?.nombre ? `Origen: ${r.origenes_reserva.nombre}` : null,
        r.codigo_reserva ? `Código: ${r.codigo_reserva}` : null,
        `App: ${APP}`,
      ].filter(Boolean).join("\n"),
      // Día completo en la fecha de entrada (el final no se incluye).
      start: { date: r.fecha_entrada },
      end: { date: sumarDia(r.fecha_entrada, 1) },
      ...(s.color ? { colorId: String(s.color) } : {}),
      transparency: "transparent",
      extendedProperties: { private: { reserva_id: r.id } },
    };
    // Sin color: PUT deja el evento con el color del calendario (quita uno anterior).
    const body = JSON.stringify(evento);
    let res = await cal(`/${id}`, { method: "PUT", body });
    if (res.status === 404) {
      res = await cal("", { method: "POST", body });
      if (res.status === 409) res = await cal(`/${id}`, { method: "PUT", body }); // creado a la vez por otra llamada
    }
    if (!res.ok) await fallo(res);
    const creado = await res.json();
    await db.from("reservas").update({
      calendario_evento_id: id,
      calendario_sync: s,
      calendario_sincronizado_at: new Date().toISOString(),
    }).eq("id", r.id);
    return { evento_id: id, enlace: creado.htmlLink };
  }

  try {
    // Entrada borrada de la base de datos: solo queda quitar su evento.
    if (cuerpo.evento_id) {
      await borrar(String(cuerpo.evento_id));
      return json({ ok: true, quitado: true });
    }

    if (cuerpo.pendientes) {
      const desde = sumarDia(hoyMadrid(), -1);
      const { data, error } = await db.from("reservas").select(SELECT)
        .gte("fecha_entrada", desde)
        .order("fecha_entrada")
        .limit(5000);
      if (error) return json({ error: "reservas", detalle: error.message }, 500);
      const pendientes = (data ?? []).filter((r) => !alDia(r)).slice(0, MAX_PENDIENTES);
      const resultado = { revisadas: data?.length ?? 0, sincronizadas: 0, errores: [] as string[] };
      for (const r of pendientes) {
        try {
          await sincronizar(r);
          resultado.sincronizadas++;
        } catch (e) {
          // Sin permiso o API desactivada: no tiene sentido seguir con las demás.
          if (e instanceof ErrorGoogle && e.codigo !== "google") return json({ error: e.codigo, ...resultado }, 403);
          resultado.errores.push(`${r.id}: ${String(e).slice(0, 200)}`);
        }
      }
      return json({ ok: true, ...resultado });
    }

    const { data: r, error } = await db.from("reservas").select(SELECT).eq("id", cuerpo.reserva_id ?? "").maybeSingle();
    if (error) return json({ error: "reserva", detalle: error.message }, 500);
    if (!r) return json({ error: "reserva" }, 404);
    return json({ ok: true, ...(await sincronizar(r)) });
  } catch (e) {
    if (e instanceof ErrorGoogle) return json({ error: e.codigo, detalle: e.detalle }, e.codigo === "google" ? 502 : 403);
    console.error("calendario:", e);
    return json({ error: "interno", detalle: String(e).slice(0, 300) }, 500);
  }
});
