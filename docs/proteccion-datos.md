# Protección de datos (RGPD / LOPDGDD): auditoría y medidas

Auditoría del 05/11/2026 sobre el código de la app y la base de datos de producción (Supabase, región eu-west-1).

## Qué datos se tratan

| Interesados | Datos | Dónde | Base jurídica | Conservación |
|---|---|---|---|---|
| Huéspedes | Identificación, documento (nº y soporte), fecha de nacimiento, sexo, nacionalidad, dirección, teléfono, correo, parentesco, motivo del viaje | `huespedes`, `registros_huespedes`; XML de SES y contratos en Google Drive; Dropbox Sign | Obligación legal (art. 6.1.c RGPD, LO 4/2015 art. 25, RD 933/2021) y contrato (art. 6.1.b) | 3 años desde la salida (RD 933/2021 art. 5) |
| Quien reserva | Nombre, apellidos, teléfono | `reservas`, `avisos_canal` (correos de Avirato / Little Hotelier) | Contrato (art. 6.1.b) | Reserva: 6 años (contable). Correos: 6 meses |
| Propietarios (clientes) | Nombre, NIF, dirección, correo, teléfono | `clientes`, `facturas` | Contrato y obligación fiscal | 6 años (facturación) |
| Usuarios de la app | Correo, nombre | Supabase Auth, `perfiles` | Contrato / interés legítimo | Mientras tenga acceso |

## Puntos críticos encontrados y corregidos

1. **Base jurídica errónea: consentimiento obligatorio.** El formulario obligaba a marcar «consiento el tratamiento».
   Un consentimiento que condiciona el servicio no es libre (art. 7.4 RGPD) y además no es la base real: el registro
   de viajeros es una obligación legal. Ahora la casilla solo confirma que se ha leído la información
   (`huespedes.consentimiento_at` pasa a significar «informado el»).
2. **Información del art. 13 RGPD incompleta.** Faltaban la base jurídica, el plazo concreto de conservación, los
   destinatarios (Ministerio del Interior, encargados), las transferencias internacionales, el derecho de reclamar ante
   la AEPD y el carácter obligatorio de los datos. Se sustituye por información por capas (básica siempre visible +
   completa desplegable), en español e inglés. Archivo: `app/f/[token]/FormularioHuespedes.tsx`.
3. **Sin plazo de conservación (art. 5.1.e).** Los datos de huéspedes no se borraban nunca; los más antiguos
   (salida 23/11/2023) superan los 3 años del RD 933/2021 este mismo mes. Nueva función `purgar_datos_caducados()`
   con tarea diaria de pg_cron: migración `supabase/migrations/20261106090000_proteccion_datos_conservacion.sql`
   (**pendiente de aplicar**).
4. **Datos del DNI guardados en el navegador del huésped.** El borrador del formulario se guardaba en `localStorage`
   (persistente, también en móviles compartidos o del alojamiento). Ahora se usa `sessionStorage` (se borra al cerrar
   la pestaña) y se eliminan los borradores antiguos.
5. **Google Fonts en los formularios públicos.** Cada visita enviaba la IP del huésped a Google sin informar de ello.
   Las fuentes se sirven ahora desde la propia app (`next/font`).
6. **Cabeceras de seguridad (art. 32).** No había ninguna. Se añaden HSTS, `nosniff`, anti-iframe,
   `Referrer-Policy: no-referrer` (el enlace `/f/<token>` es secreto y no debe enviarse a otras webs),
   `Permissions-Policy` y `noindex`. Archivo: `next.config.mjs`.

## Revisado y correcto

- RLS activado en todas las tablas; el rol `anon` no tiene acceso a tablas, solo a las funciones del formulario, que
  validan token/datos y no devuelven datos personales (solo nombres de pila ya registrados en la propia reserva).
- Todas las funciones `SECURITY DEFINER` invocables por usuarios comprueban `es_gestor()`.
- Usuarios nuevos entran como `cliente` sin acceso; los clientes solo ven sus apartamentos y reservas.
- Base de datos alojada en la UE. El service worker no guarda en caché datos de reservas ni huéspedes.
- Al vincular un envío del formulario, la copia completa se reduce a los nombres (minimización).

## Acciones pendientes (manuales, fuera del código)

1. **Aplicar la migración** `20261106090000_proteccion_datos_conservacion.sql` en Supabase (editor SQL o
   `supabase db push`). Hay que hacerlo antes del 23/11/2026.
2. **Activar «Leaked password protection»** en Supabase → Authentication → Policies (aviso del linter de seguridad).
   Recomendable también activar MFA para los gestores.
3. **Borrar los documentos caducados fuera de la base de datos** con los mismos plazos: contratos y XML de SES en
   Google Drive (3 años desde la salida), solicitudes de firma en Dropbox Sign y correos con datos de huéspedes en
   Gmail. Revisión trimestral recomendada.
4. **Contratos de encargado del tratamiento (art. 28)**: aceptar/guardar los DPA de Supabase, Vercel, Google
   Workspace, Dropbox Sign, Avirato y Little Hotelier. Verificar que Vercel y Supabase usan región UE.
5. **Contrato con los propietarios**: definir el papel de Botones Madrid frente a cada propietario (normalmente
   encargado del tratamiento del propietario, que es el titular de la vivienda turística ante el Ministerio) e
   incluir la cláusula del art. 28 RGPD. Si es así, el aviso al huésped debe nombrar también al propietario como
   responsable.
6. **Registro de actividades de tratamiento (art. 30)**: la tabla de arriba sirve de base; mantenerla actualizada.
7. **Procedimiento de brechas (arts. 33-34)**: notificar a la AEPD en 72 h si hay una brecha con riesgo; anotar
   todas las incidencias aunque no se notifiquen.
8. **Derechos de los interesados**: responder en 1 mes las solicitudes que lleguen a hola@botonesmadrid.com. Para
   acceso/supresión, los datos están en `huespedes` (por documento) y en Drive; la supresión no aplica a los datos del
   registro de viajeros mientras dure el plazo legal.
9. **Web pública** (botonesmadrid.com, si recoge datos o usa cookies): aviso legal, política de privacidad y de
   cookies.
