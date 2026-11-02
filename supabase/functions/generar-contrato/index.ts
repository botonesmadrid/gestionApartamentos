// Edge Function: genera el contrato en PDF de una reserva a partir de la plantilla
// de Google Docs del cliente y lo guarda en su estructura de Drive.
// Réplica de los Apps Script generarContratosPDF_<CLIENTE>:
//   <raíz cliente>/CONTRATOS DE ALQUILER <año>/<MM>.- <MES>/<DD>_<Nombre_Apellidos>_<piso>/
//     Contrato_temporal_<piso>_<Nombre_Apellidos>_<dd-MM-yyyy>_PTE_Firma.pdf
// (año, mes y día de la FECHA DE ENTRADA; la fecha del nombre del archivo es la de generación).
//
// La llama la app con la sesión del gestor. Cuerpo: { reserva_id, regenerar?: boolean }
// Secretos: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN (scopes drive + documents).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { ddmmyyyy, euros, Google, hoyMadrid, limpiarNombre, titularDe, tokenGoogle } from "../_shared/google.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: esGestor } = await db.rpc("es_gestor");
  if (esGestor !== true) return json({ error: "no_autorizado" }, 403);

  const { reserva_id, regenerar } = await req.json().catch(() => ({}));
  const { data: r, error } = await db
    .from("reservas")
    .select(`id, estado, nombre, apellido1, apellido2, fecha_reserva, fecha_entrada, fecha_salida, duracion,
      importe, comision_portal, codigo_reserva, origen_codigo, fecha_pago, forma_pago_codigo, telefono,
      titular_huesped_id, contrato_pdf_id,
      apartamentos(piso, num_registro, codigo_establecimiento, cru, clientes(codigo, nombre, drive_carpeta_id, drive_plantilla_id)),
      formas_pago(descripcion),
      huespedes!huespedes_reserva_id_fkey(id, created_at, nombre, apellido1, apellido2, numero_documento, soporte_documento, direccion, codigo_postal,
        nombre_municipio, codigo_municipio_ref, correo, telefono, motivo_viaje, fecha_nacimiento, pais:paises!huespedes_pais_codigo_fkey(nombre),
        nacionalidad:paises!huespedes_nacionalidad_codigo_fkey(nombre))`)
    .eq("id", reserva_id ?? "")
    .single();
  if (error || !r) return json({ error: "reserva", detalle: error?.message }, 404);
  if (r.estado === "cancelada") return json({ error: "cancelada" }, 409);

  const apto: any = r.apartamentos;
  const cliente: any = apto?.clientes;
  if (!cliente?.drive_carpeta_id || !cliente?.drive_plantilla_id) {
    return json({ error: "cliente_sin_configurar", detalle: "Configura la carpeta y la plantilla del cliente en Maestros → Clientes." }, 422);
  }
  if (r.contrato_pdf_id && !regenerar) return json({ error: "ya_generado" }, 409);

  const t = titularDe(r);
  if (!t) return json({ error: "sin_titular", detalle: "El titular aún no ha rellenado el formulario de huéspedes." }, 422);

  const piso = String(apto?.piso ?? "");
  const nombreCompleto = [t.nombre, t.apellido1, t.apellido2].filter(Boolean).join("_");
  const hoy = hoyMadrid();

  // Valores disponibles para los marcadores {{CLAVE}} de la plantilla (mismos nombres que el Sheet).
  const valores: Record<string, string> = {
    NOMBRE: t.nombre ?? "",
    APELLIDO1: t.apellido1 ?? "",
    APELLIDO2: t.apellido2 ?? "",
    DNI: t.numero_documento ?? "",
    SOPORTE: t.soporte_documento ?? "",
    DOMICILIO: t.direccion ?? "",
    CODIGOPOSTAL: t.codigo_postal ?? "",
    // La plantilla lleva {{MUNICIPIOEXT}}{{MUNICIPIO}} seguidos: solo se rellena uno (como en el Sheet).
    MUNICIPIO: t.codigo_municipio_ref ? (t.nombre_municipio ?? "") : "",
    MUNICIPIOEXT: t.codigo_municipio_ref ? "" : (t.nombre_municipio ?? ""),
    PAIS: t.pais?.nombre ?? "",
    NACIONALIDAD: t.nacionalidad?.nombre ?? "",
    CORREO: t.correo ?? "",
    TELEFONO: t.telefono ?? r.telefono ?? "",
    MOTIVO: t.motivo_viaje ?? "",
    FECHANACIMIENTO: ddmmyyyy(t.fecha_nacimiento),
    INICIO: ddmmyyyy(r.fecha_entrada),
    FIN: ddmmyyyy(r.fecha_salida),
    DURACION: r.duracion != null ? String(r.duracion) : "",
    IMPORTE: euros(r.importe),
    COMISIONPORTAL: euros(r.comision_portal),
    PISO: piso,
    NUMREGISTRO: apto?.num_registro ?? "",
    CODIGOESTABLECIMIENTO: apto?.codigo_establecimiento ?? "",
    CRU: apto?.cru ?? "",
    CLIENTE: cliente.codigo ?? "",
    CODRESERVA: r.codigo_reserva ?? "",
    FECHACONTRATO: ddmmyyyy(r.fecha_reserva),
    ORIGENRESERVA: r.origen_codigo ?? "",
    FECHAPAGO: ddmmyyyy(r.fecha_pago),
    FORMAPAGO: (r.formas_pago as any)?.descripcion ?? "",
    FECHA: ddmmyyyy(hoy, "-"),
  };
  // Pueden quedar vacíos sin bloquear (como en el Apps Script).
  const OPCIONALES = new Set(["APELLIDO2", "SOPORTE", "MUNICIPIO", "MUNICIPIOEXT", "COMISIONPORTAL", "FECHAPAGO", "FORMAPAGO", "TELEFONO", "CRU", "CODIGOESTABLECIMIENTO"]);

  try {
    const g = new Google(await tokenGoogle());

    // 1. Qué marcadores usa esta plantilla y cuáles no tienen dato.
    const marcadores = await g.marcadores(cliente.drive_plantilla_id);
    const desconocidos = marcadores.filter((m) => !(m in valores));
    const faltan = marcadores.filter((m) => m in valores && !OPCIONALES.has(m) && !valores[m].trim());
    if (faltan.length || desconocidos.length) {
      return json({ error: "faltan_datos", faltan, desconocidos }, 422);
    }

    // 2. Carpetas según la fecha de entrada.
    const carpetaReserva = await g.carpetaReserva(cliente.drive_carpeta_id, r.fecha_entrada, nombreCompleto, piso);

    // 3. Copia de la plantilla, relleno, PDF y limpieza.
    const nombreArchivo = limpiarNombre(`Contrato_temporal_${piso}_${nombreCompleto}_${ddmmyyyy(hoy, "-")}_PTE_Firma`);
    const copia = await g.copiar(cliente.drive_plantilla_id, nombreArchivo, carpetaReserva);
    let pdf: { id: string; webViewLink: string };
    try {
      await g.reemplazar(copia, Object.fromEntries(marcadores.map((k) => [k, valores[k] ?? ""])));
      pdf = await g.subirPdf(`${nombreArchivo}.pdf`, carpetaReserva, await g.exportarPdf(copia));
    } finally {
      await g.papelera(copia).catch(() => {});
    }
    if (regenerar && r.contrato_pdf_id && r.contrato_pdf_id !== pdf.id) {
      await g.papelera(r.contrato_pdf_id).catch(() => {});
    }

    await db.from("reservas").update({
      contrato_generado_at: new Date().toISOString(),
      contrato_pdf_id: pdf.id,
      contrato_carpeta_id: carpetaReserva,
      titular_huesped_id: t.id,
    }).eq("id", r.id);

    return json({
      ok: true,
      pdf_url: pdf.webViewLink,
      carpeta_url: `https://drive.google.com/drive/folders/${carpetaReserva}`,
    });
  } catch (e) {
    console.error("generar-contrato:", e);
    return json({ error: "google", detalle: String(e).slice(0, 500) }, 502);
  }
});
