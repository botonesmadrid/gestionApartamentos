-- Aplicada en producción el 2026-11-04.
-- Sincronización de las entradas con Google Calendar (función calendario): id del evento y una copia de los datos
-- con los que se envió, para saber en la vista de calendario si el evento está al día o hay que reenviarlo.
alter table public.reservas
  add column if not exists calendario_evento_id text,
  add column if not exists calendario_sync jsonb,            -- {entrada, salida, nombre, apartamento_id, num_huespedes}
  add column if not exists calendario_sincronizado_at timestamptz;
