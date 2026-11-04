// Parte de viajeros para SES Hospedajes (Ministerio del Interior): XML "altaParteHospedaje".
// Unifica los Apps Script generarXMLAgrupado_CM / _BARCO / _CHUECA (eran iguales salvo la hoja y la carpeta):
// mismas validaciones y mismo XML, pero a partir de una entrada de la app (contrato + todos sus huéspedes).
// Corrige que el script ponía a todas las personas la fecha de nacimiento del primer huésped.

export interface ContratoSes {
  codigoEstablecimiento: string | null;
  referencia: string | null; // código de la reserva
  fechaContrato: string | null; // YYYY-MM-DD
  fechaEntrada: string | null; // YYYY-MM-DD
  fechaSalida: string | null; // YYYY-MM-DD
  tipoPago: string | null; // EFECT, TARJT, PLATF, TRANS, MOVIL, TREG, DESTI, OTRO
}

export interface PersonaSes {
  rol?: string | null;
  nombre: string | null;
  apellido1: string | null;
  apellido2?: string | null;
  tipoDocumento?: string | null; // NIF, NIE, PAS, OTRO
  numeroDocumento?: string | null;
  soporteDocumento?: string | null;
  fechaNacimiento: string | null; // YYYY-MM-DD
  nacionalidad: string | null; // ISO 3166-1 alfa-3
  sexo: string | null; // H, M, O
  direccion?: string | null;
  direccionComplementaria?: string | null;
  codigoMunicipio?: string | null; // INE (solo España)
  nombreMunicipio?: string | null;
  codigoPostal?: string | null;
  pais?: string | null; // ISO 3166-1 alfa-3
  telefono?: string | null;
  telefono2?: string | null;
  correo?: string | null;
  parentesco?: string | null;
}

const vacio = (v: unknown) => v == null || String(v).trim() === "" || String(v).trim() === "#N/A";

export function validarContrato(c: ContratoSes): string[] {
  const e: string[] = [];
  if (vacio(c.codigoEstablecimiento)) e.push("Falta el código de establecimiento del piso (Maestros → Apartamentos)");
  if (vacio(c.referencia)) e.push("Falta el código de reserva (referencia)");
  if (vacio(c.fechaContrato)) e.push("Falta la fecha de la reserva (fecha de contrato)");
  if (vacio(c.fechaEntrada)) e.push("Falta la fecha de entrada");
  if (vacio(c.fechaSalida)) e.push("Falta la fecha de salida");
  return e;
}

export function validarPersona(p: PersonaSes): string[] {
  const e: string[] = [];
  for (const campo of ["tipoDocumento", "nacionalidad", "sexo", "parentesco", "pais"] as const) {
    if (String(p[campo] ?? "").trim() === "#N/A") e.push(`${campo} no puede ser #N/A`);
  }
  if (vacio(p.nombre)) e.push("Falta el nombre");
  if (vacio(p.apellido1)) e.push("Falta el primer apellido");
  if (vacio(p.fechaNacimiento)) e.push("Falta la fecha de nacimiento");
  if (vacio(p.nacionalidad)) e.push("Falta la nacionalidad");
  if (vacio(p.sexo)) e.push("Falta el sexo");
  if (p.tipoDocumento === "NIF" && vacio(p.apellido2)) e.push("Con NIF el segundo apellido es obligatorio");
  const tipo = String(p.tipoDocumento ?? "").toUpperCase();
  if (["NIF", "NIE"].includes(tipo) && String(p.nacionalidad ?? "").toUpperCase() === "ESP" && vacio(p.soporteDocumento)) {
    e.push("Con NIF/NIE y nacionalidad española el nº de soporte es obligatorio");
  }
  if (!vacio(p.tipoDocumento) && vacio(p.numeroDocumento)) e.push("Falta el número de documento");
  if (vacio(p.telefono) && vacio(p.telefono2) && vacio(p.correo)) e.push("Falta teléfono o correo");
  const pais = String(p.pais ?? "").toUpperCase();
  if (!pais) e.push("Falta el país de residencia");
  else if (pais === "ESP") {
    if (vacio(p.codigoMunicipio)) e.push("Falta el municipio (residencia en España)");
  } else if (vacio(p.nombreMunicipio)) e.push("Falta la ciudad de residencia");
  if (vacio(p.direccion)) e.push("Falta la dirección");
  if (vacio(p.codigoPostal)) e.push("Falta el código postal");
  return e;
}

export function escapeXML(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const fechaHora = (d: string) => `${d.slice(0, 10)}T00:00:00`;

export function construirXml(c: ContratoSes, personas: PersonaSes[]): string {
  const x: string[] = [];
  const add = (s: string) => x.push(s);
  const opc = (ind: string, tag: string, v: unknown) => {
    if (!vacio(v)) add(`${ind}<${tag}>${escapeXML(String(v).trim())}</${tag}>`);
  };
  add('<?xml version="1.0" encoding="UTF-8"?>');
  add('<ns2:peticion xmlns:ns2="http://www.neg.hospedajes.mir.es/altaParteHospedaje">');
  add("  <solicitud>");
  add(`    <codigoEstablecimiento>${escapeXML(c.codigoEstablecimiento)}</codigoEstablecimiento>`);
  add("    <comunicacion>");
  add("      <contrato>");
  add(`        <referencia>${escapeXML(c.referencia)}</referencia>`);
  add(`        <fechaContrato>${escapeXML(c.fechaContrato!.slice(0, 10))}</fechaContrato>`);
  add(`        <fechaEntrada>${fechaHora(c.fechaEntrada!)}</fechaEntrada>`);
  add(`        <fechaSalida>${fechaHora(c.fechaSalida!)}</fechaSalida>`);
  add(`        <numPersonas>${personas.length}</numPersonas>`);
  add("        <numHabitaciones>1</numHabitaciones>");
  add("        <internet>true</internet>");
  add("        <pago>");
  add(`          <tipoPago>${escapeXML(c.tipoPago || "OTRO")}</tipoPago>`);
  add("        </pago>");
  add("      </contrato>");
  for (const p of personas) {
    add("      <persona>");
    add(`        <rol>${escapeXML(p.rol || "VI")}</rol>`);
    add(`        <nombre>${escapeXML(String(p.nombre).trim())}</nombre>`);
    add(`        <apellido1>${escapeXML(String(p.apellido1).trim())}</apellido1>`);
    opc("        ", "apellido2", p.apellido2);
    opc("        ", "tipoDocumento", p.tipoDocumento);
    opc("        ", "numeroDocumento", p.numeroDocumento);
    opc("        ", "soporteDocumento", p.soporteDocumento);
    add(`        <fechaNacimiento>${escapeXML(String(p.fechaNacimiento).slice(0, 10))}</fechaNacimiento>`);
    add(`        <nacionalidad>${escapeXML(p.nacionalidad)}</nacionalidad>`);
    add(`        <sexo>${escapeXML(p.sexo)}</sexo>`);
    add("        <direccion>");
    opc("          ", "direccion", p.direccion);
    opc("          ", "direccionComplementaria", p.direccionComplementaria);
    const pais = String(p.pais ?? "").toUpperCase();
    if (pais === "ESP") add(`          <codigoMunicipio>${escapeXML(vacio(p.codigoMunicipio) ? "" : p.codigoMunicipio)}</codigoMunicipio>`);
    else opc("          ", "nombreMunicipio", p.nombreMunicipio);
    opc("          ", "codigoPostal", p.codigoPostal);
    opc("          ", "pais", p.pais);
    add("        </direccion>");
    opc("        ", "telefono", p.telefono);
    opc("        ", "telefono2", p.telefono2);
    opc("        ", "correo", p.correo);
    opc("        ", "parentesco", p.parentesco);
    add("      </persona>");
  }
  add("    </comunicacion>");
  add("  </solicitud>");
  add("</ns2:peticion>");
  return x.join("\n");
}
