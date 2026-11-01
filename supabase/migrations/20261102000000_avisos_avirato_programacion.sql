-- Aplicada en producción el 2026-11-01/02.
-- Ejecución automática de la Edge Function avisos-avirato cada 5 minutos.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secreto aleatorio para la llamada programada: vive solo en Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'avisos_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'avisos_cron_secret',
      'Cabecera x-cron-secret de la llamada programada a la función avisos-avirato');
  end if;
end $$;

-- La Edge Function comprueba la cabecera contra Vault sin llegar a ver el secreto.
create or replace function public.verificar_secreto_cron(p text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p, '') <> '' and p = (
    select decrypted_secret from vault.decrypted_secrets where name = 'avisos_cron_secret'
  );
$$;
revoke execute on function public.verificar_secreto_cron(text) from public, anon, authenticated;
grant execute on function public.verificar_secreto_cron(text) to service_role;

-- El secreto se lee de Vault en cada ejecución (no queda escrito en la definición del job).
select cron.schedule(
  'avisos-avirato',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://nqkyftnfmuzhphnajbtk.supabase.co/functions/v1/avisos-avirato',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
