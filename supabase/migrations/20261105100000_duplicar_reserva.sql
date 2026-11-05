-- Aplicada en producción el 2026-11-05.
-- Duplicar entrada: crea otra entrada con la misma cabecera (titular, fechas, origen, código, forma de pago, teléfono).
-- La nueva empieza en "Información obligatoria": sin importe y, si la propiedad tiene piso "SIN ASIGNAR", en ese piso
-- para que se elija el piso. El titular (si está registrado) se copia como titular que no se aloja; los huéspedes, el
-- contrato, el SES y el calendario no se copian.
create or replace function public.duplicar_reserva(p_reserva uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.reservas;
  v_apto uuid;
  v_id uuid;
  v_titular uuid;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  select * into r from public.reservas where id = p_reserva;
  if r.id is null then raise exception 'No se encuentra la entrada'; end if;

  select s.id into v_apto
  from public.apartamentos a join public.apartamentos s on s.cliente_id = a.cliente_id and s.piso = 'SIN ASIGNAR'
  where a.id = r.apartamento_id limit 1;

  insert into public.reservas (apartamento_id, fecha_reserva, fecha_entrada, fecha_salida, nombre, apellido1, apellido2,
    codigo_reserva, origen_reserva, origen_codigo, forma_pago, forma_pago_codigo, telefono, canal, importe_pendiente)
  values (coalesce(v_apto, r.apartamento_id), r.fecha_reserva, r.fecha_entrada, r.fecha_salida, r.nombre, r.apellido1,
    r.apellido2, r.codigo_reserva, r.origen_reserva, r.origen_codigo, r.forma_pago, r.forma_pago_codigo, r.telefono,
    r.canal, true)
  returning id into v_id;

  select id into v_titular from public.huespedes where id = r.titular_huesped_id and reserva_id = r.id;
  if v_titular is not null then perform public.copiar_titular(v_titular, v_id); end if;
  return v_id;
end $$;
revoke execute on function public.duplicar_reserva(uuid) from public, anon;
grant execute on function public.duplicar_reserva(uuid) to authenticated;
