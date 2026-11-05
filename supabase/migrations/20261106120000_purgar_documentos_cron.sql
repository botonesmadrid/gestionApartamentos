-- Aplicada en producción el 2026-11-05 (desde el editor SQL de Supabase).
-- Borrado automático de los documentos con datos de huéspedes fuera de la base de datos (Google Drive, Calendar y
-- Gmail) cuando superan el plazo de conservación: todos los días a las 04:10 (UTC), con el mismo secreto de Vault que
-- usa avisos-avirato. Ver supabase/functions/purgar-documentos/index.ts.
select cron.unschedule('purgar-documentos') where exists (select 1 from cron.job where jobname = 'purgar-documentos');
select cron.schedule('purgar-documentos', '10 4 * * *', $$
  select net.http_post(
    url := 'https://nqkyftnfmuzhphnajbtk.supabase.co/functions/v1/purgar-documentos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
