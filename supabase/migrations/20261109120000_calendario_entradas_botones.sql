-- Las entradas pasan al calendario "Entradas Botones" de hola@botonesmadrid.com (compartido con la cuenta personal de
-- quien lo necesite). Cada entrada guarda en calendario_sync.calendario dónde está su evento; al borrar una entrada se
-- indica ese calendario para quitar el evento de donde esté.
create or replace function public.reservas_calendario()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.calendario_evento_id is not null then
      perform public.calendario_llamar(jsonb_build_object(
        'evento_id', old.calendario_evento_id,
        'calendario', coalesce(old.calendario_sync->>'calendario', 'primary')
      ));
    end if;
    return old;
  end if;
  perform public.calendario_llamar(jsonb_build_object('reserva_id', new.id));
  return new;
end $$;
