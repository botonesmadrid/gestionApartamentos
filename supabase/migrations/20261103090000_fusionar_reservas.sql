-- Aplicada en producción el 2026-11-03 (desde el editor SQL de Supabase).
-- Entradas: fusionar dos entradas y mover huéspedes entre entradas.
-- * fusionar_reservas(origen, destino): los huéspedes del origen pasan al destino; si el titular de la cabecera del
--   origen no está entre ellos, se crea como huésped del destino. Sus líneas de Ingresos y avisos pasan al destino
--   (si el destino ya tiene la misma línea de servicio, la del origen sobra y se elimina). La entrada origen se borra.
-- * mover_huespedes(huéspedes, destino): cambia de entrada uno o varios huéspedes.
-- En ambos casos, si el destino queda con más huéspedes que su "nº de huéspedes", se actualiza.

create or replace function public._ajustar_num_huespedes(p_reserva uuid)
returns void language sql security definer set search_path = '' as $$
  update public.reservas r set num_huespedes = t.n
  from (select count(*)::int n from public.huespedes where reserva_id = p_reserva) t
  where r.id = p_reserva and r.num_huespedes is not null and t.n > r.num_huespedes;
$$;
revoke execute on function public._ajustar_num_huespedes(uuid) from public, anon, authenticated;

create or replace function public.fusionar_reservas(p_origen uuid, p_destino uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare o public.reservas; d public.reservas; v_n int; l record;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  if p_origen = p_destino then raise exception 'Elige dos entradas distintas'; end if;
  select * into o from public.reservas where id = p_origen for update;
  select * into d from public.reservas where id = p_destino for update;
  if o.id is null or d.id is null then raise exception 'No se encuentra alguna de las entradas'; end if;

  -- El titular de la cabecera del origen pasa a ser huésped del destino si no lo era ya.
  if coalesce(trim(o.nombre), '') <> '' and not exists (
    select 1 from public.huespedes h
    where h.reserva_id in (o.id, d.id)
      and lower(trim(h.nombre)) = lower(trim(o.nombre))
      and lower(trim(coalesce(h.apellido1, ''))) = lower(trim(coalesce(o.apellido1, '')))
  ) then
    insert into public.huespedes (reserva_id, nombre, apellido1, apellido2, telefono, origen_datos)
    values (d.id, trim(o.nombre), nullif(trim(o.apellido1), ''), nullif(trim(o.apellido2), ''), o.telefono, 'fusion');
  end if;

  update public.huespedes set reserva_id = d.id where reserva_id = o.id;
  get diagnostics v_n = row_count;

  -- Datos de contacto que le falten al destino.
  update public.reservas set telefono = coalesce(telefono, o.telefono) where id = d.id;

  update public.avisos_canal set reserva_id = d.id where reserva_id = o.id;

  for l in select id, servicio from public.ingresos where reserva_id = o.id loop
    if exists (select 1 from public.ingresos where reserva_id = d.id and servicio = l.servicio) then
      delete from public.ingresos where id = l.id;
    else
      update public.ingresos set reserva_id = d.id where id = l.id;
    end if;
  end loop;

  delete from public.reservas where id = o.id;
  perform public._ajustar_num_huespedes(d.id);
  return v_n;
end $$;
revoke execute on function public.fusionar_reservas(uuid, uuid) from public, anon;
grant execute on function public.fusionar_reservas(uuid, uuid) to authenticated;

create or replace function public.mover_huespedes(p_huespedes uuid[], p_destino uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  if not exists (select 1 from public.reservas where id = p_destino) then raise exception 'No se encuentra la entrada destino'; end if;
  -- Si un huésped movido era el titular de su entrada, esa entrada se queda sin titular marcado.
  update public.reservas set titular_huesped_id = null
  where titular_huesped_id = any(p_huespedes) and id <> p_destino;
  update public.huespedes set reserva_id = p_destino where id = any(p_huespedes) and reserva_id <> p_destino;
  get diagnostics v_n = row_count;
  perform public._ajustar_num_huespedes(p_destino);
  return v_n;
end $$;
revoke execute on function public.mover_huespedes(uuid[], uuid) from public, anon;
grant execute on function public.mover_huespedes(uuid[], uuid) to authenticated;

-- Eliminar una entrada: se borran sus huéspedes y sus líneas de Ingresos. No se permite si alguna de esas líneas
-- ya está en una factura emitida (en ese caso, mejor cancelarla).
create or replace function public.eliminar_reserva(p_reserva uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  if exists (
    select 1 from public.facturas_lineas fl join public.facturas f on f.id = fl.factura_id
    where f.estado = 'emitida' and fl.ingreso_ids && array(select id from public.ingresos where reserva_id = p_reserva)
  ) then
    raise exception 'La entrada está en una factura emitida: cancélala en lugar de eliminarla';
  end if;
  delete from public.ingresos where reserva_id = p_reserva;
  delete from public.reservas where id = p_reserva;
end $$;
revoke execute on function public.eliminar_reserva(uuid) from public, anon;
grant execute on function public.eliminar_reserva(uuid) to authenticated;
