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

## Acciones pendientes (actualizado 06/11/2026)

### Ahora
1. **Registrar el móvil** de cada gestor en la verificación en dos pasos (la app lo pide al entrar).
2. **Probar «+ Añadir huésped a mano»** en una entrada.
3. **Gmail: borrar a mano** (una vez al trimestre) los correos de más de 3 años con datos de huéspedes: avisos de
   Avirato, Little Hotelier y Dropbox Sign, y los formularios enviados («Registro de huéspedes / Guest registration»).
   En Gmail, buscar p. ej. `from:noreply@avirato.com older_than:3y` y borrar.
4. ~~Aplicar la migración del borrado diario de documentos~~ (hecho el 05/11/2026).

### Protección de datos (trámites fuera de la app)
5. **Contratos de encargado del tratamiento (art. 28)**: aceptar y guardar los DPA de Supabase, Vercel, Google
   Workspace, Dropbox Sign, Avirato y Little Hotelier.
6. **Contrato con los propietarios**: normalmente Botones Madrid es encargado del tratamiento de cada propietario
   (titular de la vivienda turística ante el Ministerio): incluir la cláusula del art. 28 RGPD y, si es así, nombrar
   también al propietario como responsable en el aviso del formulario. Confirmarlo con un asesor.
7. **Dropbox Sign**: las solicitudes de firma no se pueden borrar automáticamente (la app no usa su API); revisar
   una vez al año y eliminar las de más de 3 años.
8. **Procedimientos**: brechas (notificar a la AEPD en 72 h si hay riesgo y anotar todas las incidencias), derechos
   de los interesados (responder en 1 mes; la supresión no aplica a los datos que la ley obliga a conservar) y
   mantener al día el registro de tratamientos (tabla de arriba).
9. **Web pública** (botonesmadrid.com, si recoge datos o usa cookies): aviso legal, política de privacidad y de
   cookies.

### Seguridad
- **«Leaked password protection»** de Supabase es de pago: no se aplica. Lo compensa la verificación en dos pasos
  (una contraseña filtrada sola no da acceso). Opcional y gratis: en Supabase → Authentication → Providers → Email,
  exigir contraseñas de al menos 12 caracteres con letras y números.
- Funciones antiguas `recuperar-motivos` y `diagnostico-google` (desactivadas): borradas el 06/11/2026.

### Opcional (riesgo bajo)
- Formulario `/registro`: el límite de 60 envíos por hora es global; si alguien lo satura, limitar por IP en el
  firewall de Vercel o añadir un captcha.
- Previews de Vercel: fallan porque las variables de Supabase solo están en Production; añadirlas a Preview si se
  quieren ver las PR antes de fusionar.
- Supabase: mover la extensión `pg_net` fuera de `public`. Dependencia `image-size` (vía `pptxgenjs`) con aviso sin
  versión corregida; solo procesa imágenes propias del informe trimestral.

## Borrado automático de documentos (06/11/2026)

La base de datos se limpia sola (`purgar_datos_caducados`, 03:40 UTC). Fuera de ella, la Edge Function
`purgar-documentos` (04:10 UTC, migración `20261106120000_purgar_documentos_cron.sql`, aplicada) manda a la papelera lo que
supera los 3 años desde el fin de la estancia (la papelera se vacía sola a los 30 días):

| Dónde | Qué | Estado |
|---|---|---|
| Google Drive | Carpetas de contratos y XML de SES: por los identificadores guardados en la entrada y recorriendo `CONTRATOS DE ALQUILER <año>/<MM>.- <MES>/<DD>_…` de cada cliente (por fecha de entrada, con 60 días de margen) | Funciona |
| Google Calendar | Eventos de las entradas | Aún no se sincroniza el calendario; cuando se haga, necesitará el permiso `calendar.events` |
| Gmail | — | No se automatiza: se borra a mano (decisión del 05/11/2026) |

Simulación (no borra nada, solo cuenta), desde el editor SQL:

```sql
select net.http_post(
  url := 'https://nqkyftnfmuzhphnajbtk.supabase.co/functions/v1/purgar-documentos?simulacion=1',
  headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
    (select decrypted_secret from vault.decrypted_secrets where name='avisos_cron_secret')),
  body := '{}'::jsonb, timeout_milliseconds := 120000);
-- y al cabo de unos segundos: select content from net._http_response order by id desc limit 1;
```

### Ampliar los permisos de Google (cuando se sincronice Calendar)
Hay que generar un nuevo *refresh token* de `hola@botonesmadrid.com` con todos los permisos que usa la app (Gmail
lectura y envío, Drive, Docs y Calendar; el borrado de correos no lo hace la app aunque el permiso lo permita):

1. Google Cloud Console → el proyecto del OAuth → *APIs y servicios* → activar **Google Calendar API** (si no lo está).
   En *Credenciales* → el ID de cliente OAuth → añadir como URI de redirección autorizado
   `https://developers.google.com/oauthplayground`.
2. Abrir https://developers.google.com/oauthplayground → engranaje → *Use your own OAuth credentials* → pegar el
   client ID y el secret (`GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`).
3. En *Input your own scopes* pegar (separados por espacios):
   `https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/calendar.events`
4. *Authorize APIs* con `hola@botonesmadrid.com` → *Exchange authorization code for tokens* → copiar el
   **Refresh token**.
5. Supabase → Edge Functions → Secrets → actualizar `GMAIL_REFRESH_TOKEN` con el nuevo valor.
6. Repetir la simulación: `permisos.calendario` debe salir a `true`.

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

### Pendiente

Ver «Acciones pendientes (actualizado 06/11/2026)» al principio.

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
