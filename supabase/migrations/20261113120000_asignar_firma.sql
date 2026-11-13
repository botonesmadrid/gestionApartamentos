-- Firmas de contrato (HelloSign) que no se han podido asociar solas a una entrada: se asignan a mano desde Entradas.
--  * asignar_firma(aviso, reserva): marca el contrato de la entrada como firmado (con la fecha del correo) y deja el
--    aviso resuelto con datos.pdf_pendiente = true. La siguiente pasada de avisos-avirato baja el PDF firmado del
--    correo, lo guarda en la carpeta de Drive de la entrada y quita la marca.

create or replace function public.asignar_firma(p_aviso uuid, p_reserva uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.avisos_canal; r public.reservas;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  select * into a from public.avisos_canal where id = p_aviso for update;
  if a.id is null or a.canal <> 'hellosign' then raise exception 'No se encuentra la firma'; end if;
  if a.resultado <> 'revisar' then raise exception 'Esta firma ya no está pendiente'; end if;
  select * into r from public.reservas where id = p_reserva for update;
  if r.id is null then raise exception 'No se encuentra la entrada'; end if;
  if r.estado = 'cancelada' then raise exception 'La entrada está cancelada'; end if;

  update public.reservas set contrato_firmado_at = coalesce(contrato_firmado_at, a.recibido_at, now())
  where id = r.id;
  update public.avisos_canal set
    resultado = 'actualizada',
    reserva_id = r.id,
    detalle = 'asignada a mano; el PDF firmado se guarda en Drive en la siguiente pasada',
    datos = coalesce(datos, '{}'::jsonb) || jsonb_build_object('pdf_pendiente', true),
    procesado_at = now()
  where id = a.id;
end $$;
revoke execute on function public.asignar_firma(uuid, uuid) from public, anon;
grant execute on function public.asignar_firma(uuid, uuid) to authenticated;
