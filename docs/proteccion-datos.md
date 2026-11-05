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
   con tarea diaria de pg_cron (03:40 UTC): migración
   `supabase/migrations/20261106090000_proteccion_datos_conservacion.sql` (aplicada el 05/11/2026).
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

1. ~~Aplicar la migración de conservación~~ (hecho el 05/11/2026).
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

## Auditoría de seguridad (05/11/2026)

### Críticos corregidos

1. **Next.js 14.2.35 con vulnerabilidades críticas** (ejecución remota de código sin autenticar en el optimizador de
   imágenes, SSRF, denegación de servicio, XSS; 1 crítica y 2 altas según `npm audit`). La rama 14 ya no recibe
   parches. Actualizado a **Next 16.4.5 + React 19**: `cookies()` y `params`/`searchParams` pasan a ser asíncronos y
   `middleware.ts` se renombra a `proxy.ts`. Requiere Node 20.9 o superior en Vercel.
2. **Alta de cuentas desde el login.** El enlace mágico pedía crear la cuenta si el correo no existía. En la práctica
   no era explotable porque el alta de usuarios ya estaba desactivada en Supabase («Allow new users to sign up»), pero
   ahora el código también lo impide (`shouldCreateUser: false`), como segunda barrera.
3. **Sin Content-Security-Policy.** Añadida: la página solo ejecuta código propio y solo se conecta con Supabase,
   así que una inyección de código no podría enviar datos a otro servidor. Probada en navegador sin errores.

### Revisado y correcto

- Funciones del servidor (`supabase/functions/*`): todas exigen sesión de gestor (`es_gestor`), salvo
  `avisos-avirato`, que exige el secreto del cron guardado en Vault.
- Correos y PDF se generan como texto plano o con escape de HTML; las cabeceras de correo van codificadas.
- `auth/callback` solo redirige a rutas internas (sin redirección abierta).
- No hay claves ni secretos en el repositorio ni en su historial.
- Dependencia `image-size` (vía `pptxgenjs`, aviso alto de denegación de servicio): solo procesa las imágenes propias
  del informe trimestral en el navegador. Riesgo bajo; no hay versión corregida compatible.

### Pendiente (configuración en paneles, no en el código)

1. ~~Desactivar «Allow new users to sign up»~~ (ya estaba desactivado).
2. Supabase → Authentication: **activar «Leaked password protection»**. (MFA: hecho, ver abajo.)
3. Supabase: mover la extensión `pg_net` fuera del esquema `public` (aviso del linter; riesgo bajo).
4. Formulario `/registro`: el límite de 60 envíos por hora es global; alguien podría agotarlo con envíos falsos y
   bloquear a los huéspedes reales durante una hora. Si ocurre, conviene limitar por IP (p. ej. con el firewall de
   Vercel) o añadir un captcha.

## Verificación en dos pasos (MFA) y región (06/11/2026)

- **MFA obligatorio** para todos los usuarios de la app (app de autenticación, TOTP):
  - `/cuenta/verificacion`: la primera vez se escanea un QR; después se pide el código de 6 dígitos.
  - `proxy.ts`: sin el segundo factor (sesión `aal1`) no se puede abrir ninguna página interna.
  - Base de datos (`20261106100000_mfa_obligatorio.sql`): política restrictiva «mfa obligatorio» en todas las tablas y
    `es_gestor()` exige `aal2`. Las tablas nuevas deben llevar la misma política.
  - Móvil perdido: un administrador borra el factor del usuario en Supabase → Authentication → Users; al volver a
    entrar se le pide registrar el móvil de nuevo.
- **Región de Vercel: Dublín (`dub1`)** en `vercel.json`, junto a Supabase (eu-west-1): las funciones de la app ya no
  procesan los datos en EE. UU.

## Rendimiento y limpieza (06/11/2026)

- Páginas (Entradas, Ingresos, administración): la sesión y los datos se piden en paralelo en vez de uno tras otro.
- Menú: los contadores de acciones pendientes (6 consultas) ya no se recalculan en cada cambio de página, solo al
  cargar, tras una acción que los cambia o si tienen más de un minuto.
- Base de datos (`20261106110000_rendimiento_rls_indices.sql`): `auth.uid()`, `auth.jwt()` y `es_gestor()` se
  calculan una vez por consulta en las políticas RLS, políticas solo para `authenticated`, tres políticas heredadas
  eliminadas e índices en 11 claves foráneas.
- Código sin uso eliminado (`components/ModuloPendiente.tsx`, `cerrarSesion`, `pisosDe`, `eur2`); el script
  `lint` (eliminado en Next 16) pasa a ser `typecheck`.
- Páginas antiguas de `/apartamentos/...` eliminadas: el alta manual de huéspedes se hace ahora en Entradas («+ Añadir
  huésped a mano» abre el mismo formulario que la edición); apartamentos en Maestros y reservas en Entradas.
