// Acciones pendientes de las reservas: las usan el menú lateral (contadores) y el
// listado de Entradas (filtro ?accion=…), para que ambos cuenten exactamente lo mismo.

export type Accion = "importe" | "formulario_enviar" | "formulario_esperando" | "contrato" | "ses" | "checkin";

export const ACCIONES: { clave: Accion; etiqueta: string; ayuda: string }[] = [
  { clave: "importe", etiqueta: "Información obligatoria", ayuda: "Falta el piso o el importe" },
  { clave: "formulario_enviar", etiqueta: "Enviar formulario", ayuda: "Formulario de huéspedes sin enviar" },
  { clave: "formulario_esperando", etiqueta: "Faltan huéspedes", ayuda: "Formulario enviado, faltan datos de huéspedes" },
  { clave: "contrato", etiqueta: "Contrato", ayuda: "Contrato sin generar o sin firmar" },
  { clave: "ses", etiqueta: "SES Hospedajes", ayuda: "Generar el XML, subirlo a SES y marcarlo como comunicado" },
  { clave: "checkin", etiqueta: "Check-in", ayuda: "Listas para check-in con la entrada ya llegada" },
];

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });

// Aplica a una consulta de `reservas` las condiciones de la acción.
// deno-lint-ignore no-explicit-any
export function filtrarAccion<Q extends { eq: any; is: any; not: any; gte: any; lte: any; or: any }>(q: Q, accion: Accion): Q {
  let r: any = q.eq("estado", "confirmada");
  switch (accion) {
    case "importe":
      return r.or("importe_pendiente.eq.true,piso_pendiente.eq.true");
    case "formulario_enviar":
      return r.eq("importe_pendiente", false).eq("piso_pendiente", false).is("formulario_completado_at", null).is("formulario_enviado_at", null)
        .is("checkin_at", null).gte("fecha_salida", hoy());
    case "formulario_esperando":
      return r.eq("importe_pendiente", false).eq("piso_pendiente", false).is("formulario_completado_at", null).not("formulario_enviado_at", "is", null)
        .is("checkin_at", null).gte("fecha_salida", hoy());
    case "contrato":
      return r.eq("importe_pendiente", false).eq("piso_pendiente", false).is("contrato_firmado_at", null).is("checkin_at", null)
        .gte("fecha_salida", hoy());
    case "ses":
      return r.eq("fase", "pendiente_ses").gte("fecha_salida", hoy());
    case "checkin":
      return r.eq("fase", "lista_checkin").lte("fecha_entrada", hoy());
  }
  return r;
}
