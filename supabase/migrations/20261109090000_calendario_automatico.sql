-- Sincronización automática de las entradas con Google Calendar (función calendario).
--
-- 1. Color por cliente (clientes.color_calendario): el colorId de los eventos de Google Calendar (1-11). La app pinta
--    a cada cliente con ese mismo color, así que la app y Calendar siguen el mismo patrón:
--    Acuerdo (CM) rojo · Chueca morado · Barco azul.
-- 2. Al crear, modificar, cancelar o borrar una entrada, la base de datos llama a la función calendario (pg_net, con el
--    secreto de Vault de avisos-avirato) para crear, actualizar o quitar su evento. También al cambiar el piso de un
--    apartamento o el cliente/color de un cliente (se revisan todas las entradas pendientes).
-- 3. Cada 10 minutos pg_cron revisa las entradas desde ayer en adelante y reenvía las que no estén al día (por si
--    alguna llamada falló, p. ej. sin conexión con Google). La primera pasada da de alta las entradas ya existentes.

-- 1. Color por cliente ------------------------------------------------------------------------------------------------
alter table public.clientes
  add column if not exists color_calendario smallint check (color_calendario between 1 and 11);
comment on column public.clientes.color_calendario is
  'Color de los eventos de Google Calendar (colorId 1-11) y de la app: 11 rojo (tomate), 3 morado (uva), 9 azul (arándano)…';

update public.clientes set color_calendario = 11 where codigo = 'CM' and color_calendario is null; -- Acuerdo: rojo
update public.clientes set color_calendario = 3  where codigo = 'CH' and color_calendario is null; -- Chueca: morado
update public.clientes set color_calendario = 9  where codigo = 'BA' and color_calendario is null; -- Barco: azul

-- 2. Llamada a la función ----------------------------------------------------------------------------------------------
create or replace function public.calendario_llamar(p_cuerpo jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://nqkyftnfmuzhphnajbtk.supabase.co/functions/v1/calendario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_cron_secret')
    ),
    body := p_cuerpo,
    timeout_milliseconds := 60000
  );
end $$;
revoke execute on function public.calendario_llamar(jsonb) from public, anon, authenticated;

create or replace function public.reservas_calendario()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.calendario_evento_id is not null then
      perform public.calendario_llamar(jsonb_build_object('evento_id', old.calendario_evento_id));
    end if;
    return old;
  end if;
  perform public.calendario_llamar(jsonb_build_object('reserva_id', new.id));
  return new;
end $$;

-- Altas siempre; modificaciones solo si cambia algo que se ve en Calendar (las columnas calendario_* que actualiza la
-- propia función no están en la lista, así que no hay bucle); borrados solo si tenían evento.
drop trigger if exists reservas_calendario_ins on public.reservas;
drop trigger if exists reservas_calendario_upd on public.reservas;
drop trigger if exists reservas_calendario_del on public.reservas;
create trigger reservas_calendario_ins
  after insert on public.reservas for each row
  execute function public.reservas_calendario();
create trigger reservas_calendario_upd
  after update of estado, fecha_entrada, fecha_salida, nombre, apellido1, apartamento_id, num_huespedes
  on public.reservas for each row
  when ((old.estado, old.fecha_entrada, old.fecha_salida, old.nombre, old.apellido1, old.apartamento_id, old.num_huespedes)
    is distinct from (new.estado, new.fecha_entrada, new.fecha_salida, new.nombre, new.apellido1, new.apartamento_id, new.num_huespedes))
  execute function public.reservas_calendario();
create trigger reservas_calendario_del
  after delete on public.reservas for each row
  when (old.calendario_evento_id is not null)
  execute function public.reservas_calendario();

-- Piso o cliente de un apartamento, o código/color de un cliente: se revisan las entradas pendientes.
create or replace function public.calendario_revisar_pendientes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.calendario_llamar('{"pendientes": true}'::jsonb);
  return null;
end $$;

drop trigger if exists apartamentos_calendario on public.apartamentos;
create trigger apartamentos_calendario
  after update of piso, cliente_id on public.apartamentos for each row
  when ((old.piso, old.cliente_id) is distinct from (new.piso, new.cliente_id))
  execute function public.calendario_revisar_pendientes();

drop trigger if exists clientes_calendario on public.clientes;
create trigger clientes_calendario
  after update of codigo, nombre, color_calendario on public.clientes for each row
  when ((old.codigo, old.nombre, old.color_calendario) is distinct from (new.codigo, new.nombre, new.color_calendario))
  execute function public.calendario_revisar_pendientes();

-- 3. Revisión periódica ------------------------------------------------------------------------------------------------
select cron.unschedule('calendario-pendientes') where exists (select 1 from cron.job where jobname = 'calendario-pendientes');
select cron.schedule('calendario-pendientes', '*/10 * * * *', $$ select public.calendario_llamar('{"pendientes": true}'::jsonb); $$);
