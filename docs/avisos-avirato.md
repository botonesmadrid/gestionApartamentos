# Reservas desde los avisos de Avirato

Avirato (channel manager de **Chueca** y **Barco**) envía un correo a `hola@botonesmadrid.com`
por cada reserva nueva, modificación o cancelación. Esos correos alimentan la tabla `reservas`.

## Cómo funciona

1. `supabase/functions/avisos-avirato` (Edge Function) busca en Gmail, cada 5 minutos,
   `from:noreply@avirato.com subject:"Id reserva"` (Papelera incluida).
2. `supabase/functions/_shared/avirato.ts` lee cada correo (tipo, portal, código, piso, fechas,
   titular, teléfono, *Precio Total*). Pruebas: `node --experimental-strip-types --test supabase/functions/_shared/avirato.test.ts`.
3. `public.registrar_aviso_canal(jsonb)` lo aplica:
   - busca la reserva por **código** y, si no, por **piso + entrada + salida**;
   - **alta** → crea la reserva; **modificación** → la actualiza; **cancelación** → `estado = 'cancelada'` (no se borra);
   - cada correo queda en `public.avisos_canal` (texto original, datos leídos y resultado);
     los que no se pueden aplicar quedan con `resultado = 'revisar'`;
   - un aviso más antiguo que el último aplicado a esa reserva no la modifica (`resultado = 'obsoleto'`).

## Importes

- *Precio Total* de Avirato = **neto**: con IVA, sin la comisión del portal → `importe_neto`.
- `importe` = total con comisión. Lo introduce el gestor desde la burbuja
  **"Falta importe con comisión"** del listado de Entradas (`importe_pendiente = true`).
- `comision_portal` se calcula sola: `importe − importe_neto` (trigger).
- Reservas **directas**: sin comisión, `importe = importe_neto`, sin acción pendiente.
- Si una modificación cambia el neto, la reserva vuelve a quedar pendiente.

## Pisos

Cada apartamento tiene `nombre_en_canal` (editable en Maestros → Apartamentos):

| Piso | Nombre en Avirato ("Tipo de Habitación") |
|---|---|
| 1ª Izq (Barco) | `El Botones Barco` |
| 1º Dcha (Chueca) | `El Botones -Nuevo apto temporal en Plaza de Chueca` |

## Puesta en marcha (una sola vez)

1. **Google Cloud** (con una cuenta de administrador de Google Workspace):
   crear proyecto → activar *Gmail API* → pantalla de consentimiento OAuth de tipo **Interna** →
   credenciales *ID de cliente OAuth* (aplicación web). Scope: `https://www.googleapis.com/auth/gmail.readonly`.
2. Obtener un *refresh token* autorizando con `hola@botonesmadrid.com`.
3. Guardar los secretos en Supabase (nunca en el código):
   `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`. El secreto de la llamada programada (`avisos_cron_secret`) se genera en Vault y la función lo comprueba con `public.verificar_secreto_cron`.
4. Activar la **Gmail API** en el proyecto de Google Cloud.
5. Desplegar la función `avisos-avirato` (sin verificación JWT; la protege `x-cron-secret`).
6. Programarla con `pg_cron` + `pg_net` cada 5 minutos, enviando la cabecera `x-cron-secret`
   (el secreto guardado en Vault, no en texto plano).

## Revisar que funciona

```sql
-- últimas ejecuciones programadas
select start_time, status, return_message from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'avisos-avirato')
order by start_time desc limit 10;

-- respuestas de la función (se guardan unas horas)
select created, status_code, left(content::text, 300) from net._http_response order by created desc limit 10;

-- correos procesados y los que hay que revisar
select recibido_at, asunto, resultado, detalle from public.avisos_canal order by recibido_at desc;
```
