// Edge Function: genera el XML del parte de viajeros (SES Hospedajes) de una entrada y lo guarda en la carpeta de
// Drive de la entrada. Después se sube a mano a la plataforma SES y se marca como comunicado en la app.
// La llama la app con la sesión del gestor. Cuerpo: { reserva_id }
// Respuesta: { ok, xml_id, xml_url, carpeta_url } o { error: "validacion", errores: [{ quien, errores[] }] }.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { Google, limpiarNombre, titularDe, tokenGoogle } from "../_shared/google.ts";
import { construirXml, type ContratoSes, type PersonaSes, validarContrato, validarPersona } from "../_shared/ses.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const fecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
};
const ahoraMadrid = () => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return `${p.day}-${p.month}-${p.year}_${p.hour}-${p.minute}-${p.second}`;
};

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
    .select(`id, estado, nombre, apellido1, apellido2, fecha_reserva, fecha_entrada, fecha_salida, codigo_reserva,
      forma_pago_codigo, created_at, titular_huesped_id, contrato_carpeta_id, ses_xml_id,
      apartamentos(piso, codigo_establecimiento, clientes(drive_carpeta_id)),
      huespedes!huespedes_reserva_id_fkey(id, created_at, nombre, apellido1, apellido2, tipo_documento_codigo, numero_documento,
        soporte_documento, fecha_nacimiento, nacionalidad_codigo, sexo_codigo, direccion, codigo_postal, pais_codigo,
        codigo_municipio_ref, nombre_municipio, telefono, correo, parentesco_codigo, rol, es_huesped)`)
    .eq("id", reserva_id ?? "")
    .single();
  if (error || !r) return json({ error: "reserva", detalle: error?.message }, 404);
  if (r.estado === "cancelada") return json({ error: "cancelada" }, 409);

  const apto: any = r.apartamentos;
  // Solo las personas que se alojan (el titular que solo reserva no va en el parte).
  const huespedes: any[] = (r.huespedes ?? []).filter((h: any) => h.es_huesped !== false);
  if (!huespedes.length) return json({ error: "validacion", errores: [{ quien: "Entrada", errores: ["No hay huéspedes registrados"] }] }, 422);

  // El titular va primero (como en el Sheet); después, por orden de registro.
  const titular = titularDe(r);
  huespedes.sort((a, b) =>
    a.id === titular?.id ? -1 : b.id === titular?.id ? 1 : String(a.created_at).localeCompare(String(b.created_at)));

  const contrato: ContratoSes = {
    codigoEstablecimiento: apto?.codigo_establecimiento ?? null,
    referencia: r.codigo_reserva,
    fechaContrato: r.fecha_reserva ?? String(r.created_at).slice(0, 10),
    fechaEntrada: r.fecha_entrada,
    fechaSalida: r.fecha_salida,
    tipoPago: r.forma_pago_codigo ?? "OTRO",
  };
  const personas: PersonaSes[] = huespedes.map((h) => ({
    rol: h.rol || "VI",
    nombre: h.nombre,
    apellido1: h.apellido1,
    apellido2: h.apellido2,
    tipoDocumento: h.tipo_documento_codigo,
    numeroDocumento: h.numero_documento,
    soporteDocumento: h.soporte_documento,
    fechaNacimiento: h.fecha_nacimiento,
    nacionalidad: h.nacionalidad_codigo,
    sexo: h.sexo_codigo,
    direccion: h.direccion,
    codigoMunicipio: h.pais_codigo === "ESP" ? h.codigo_municipio_ref : null,
    nombreMunicipio: h.pais_codigo === "ESP" ? null : h.nombre_municipio,
    codigoPostal: h.codigo_postal,
    pais: h.pais_codigo,
    telefono: h.telefono,
    correo: h.correo,
    parentesco: h.parentesco_codigo,
  }));

  const errores = [
    { quien: "Entrada", errores: validarContrato(contrato) },
    ...personas.map((p, i) => ({ quien: [huespedes[i].nombre, huespedes[i].apellido1].filter(Boolean).join(" ") || `Huésped ${i + 1}`, errores: validarPersona(p) })),
  ].filter((x) => x.errores.length);
  if (errores.length) return json({ error: "validacion", errores }, 422);

  try {
    const g = new Google(await tokenGoogle());
    // Carpeta de la entrada (la del contrato); si no hay, la de siempre: CONTRATOS DE ALQUILER <año>/<MM>.- <MES>/<DD>_<titular>_<piso>
    let carpeta = r.contrato_carpeta_id as string | null;
    const piso = String(apto?.piso ?? "");
    const nombreTitular = [titular?.nombre ?? r.nombre, titular?.apellido1 ?? r.apellido1, titular?.apellido2].filter(Boolean).join("_");
    if (!carpeta) {
      const raiz = apto?.clientes?.drive_carpeta_id;
      if (!raiz) return json({ error: "cliente_sin_configurar" }, 422);
      carpeta = await g.carpetaReserva(raiz, r.fecha_entrada, nombreTitular, piso);
    }

    const xml = construirXml(contrato, personas);
    const nombre = limpiarNombre(`SES_${nombreTitular}_${fecha(r.fecha_entrada)}_${contrato.codigoEstablecimiento}_${piso}_${ahoraMadrid()}`) + ".xml";
    const archivo = await g.subir(nombre, carpeta, new TextEncoder().encode(xml), "text/xml");
    if (r.ses_xml_id && r.ses_xml_id !== archivo.id) await g.papelera(r.ses_xml_id).catch(() => {});

    await db.from("reservas").update({
      ses_xml_id: archivo.id,
      ses_generado_at: new Date().toISOString(),
      contrato_carpeta_id: carpeta,
    }).eq("id", r.id);

    return json({ ok: true, xml_id: archivo.id, xml_url: archivo.webViewLink, carpeta_url: `https://drive.google.com/drive/folders/${carpeta}` });
  } catch (e) {
    console.error("ses-hospedajes:", e);
    return json({ error: "google", detalle: String(e).slice(0, 500) }, 502);
  }
});
