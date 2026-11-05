-- Aplicada en producción el 2026-11-05.
-- El titular de una entrada (quien reserva y firma el contrato) no tiene por qué alojarse: puede reservar para otros o
-- reservar dos entradas y alojarse solo en una. huespedes.es_huesped = false marca a una persona que está en la
-- entrada solo como titular: firma el contrato, pero no cuenta en el nº de huéspedes ni en el formulario completo,
-- y no va en el parte de SES Hospedajes.

alter table public.huespedes add column if not exists es_huesped boolean not null default true;

-- Las funciones que cuentan los huéspedes de una entrada pasan a contar solo los que se alojan.
do $$
declare
  f record;
  v_def text;
  v_nueva text;
begin
  for f in
    select * from (values
      ('public.sincronizar_formulario(uuid)',
       '(select count(*) from public.huespedes h where h.reserva_id = r.id)',
       '(select count(*) from public.huespedes h where h.reserva_id = r.id and h.es_huesped)'),
      ('public._ajustar_num_huespedes(uuid)',
       'from public.huespedes where reserva_id = p_reserva)',
       'from public.huespedes where reserva_id = p_reserva and es_huesped)'),
      ('public.formulario_registrar(uuid,jsonb)',
       'select count(*) into v_registrados from public.huespedes where reserva_id = v_res.id;',
       'select count(*) into v_registrados from public.huespedes where reserva_id = v_res.id and es_huesped;'),
      ('public.formulario_obtener(uuid)',
       '(select count(*) from public.huespedes h where h.reserva_id = res.id) registrados',
       '(select count(*) from public.huespedes h where h.reserva_id = res.id and h.es_huesped) registrados'),
      ('public._vincular_registro(uuid,uuid,text)',
       '(select count(*) from public.huespedes h where h.reserva_id = res.id))::int',
       '(select count(*) from public.huespedes h where h.reserva_id = res.id and h.es_huesped))::int')
    ) as t(firma, antes, despues)
  loop
    v_def := pg_get_functiondef(f.firma::regprocedure);
    if position(f.antes in v_def) = 0 then
      raise exception 'No se encuentra el texto a cambiar en %', f.firma;
    end if;
    v_nueva := replace(v_def, f.antes, f.despues);
    execute v_nueva;
  end loop;
end $$;

-- Al cambiar si una persona se aloja, se recalcula si el formulario está completo.
create trigger huespedes_sincronizar_es_huesped
  after update of es_huesped on public.huespedes
  for each row execute function public.huespedes_sincronizar_formulario();

-- Titular también de otra entrada: copia a la persona en la entrada destino como titular que no se aloja.
create or replace function public.copiar_titular(p_huesped uuid, p_destino uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  if not exists (select 1 from public.reservas where id = p_destino) then raise exception 'No se encuentra la entrada destino'; end if;
  insert into public.huespedes (reserva_id, nombre, apellido1, apellido2, sexo_codigo, fecha_nacimiento, tipo_documento_codigo,
    numero_documento, soporte_documento, nacionalidad_codigo, direccion, codigo_postal, pais_codigo, codigo_municipio_ref,
    nombre_municipio, parentesco_codigo, telefono, correo, motivo_viaje, rol, consentimiento_at, origen_datos, es_huesped)
  select p_destino, nombre, apellido1, apellido2, sexo_codigo, fecha_nacimiento, tipo_documento_codigo,
    numero_documento, soporte_documento, nacionalidad_codigo, direccion, codigo_postal, pais_codigo, codigo_municipio_ref,
    nombre_municipio, parentesco_codigo, telefono, correo, motivo_viaje, rol, consentimiento_at, 'copia_titular', false
  from public.huespedes where id = p_huesped
  returning id into v_id;
  if v_id is null then raise exception 'No se encuentra la persona'; end if;
  update public.reservas set titular_huesped_id = v_id where id = p_destino;
  return v_id;
end $$;
revoke execute on function public.copiar_titular(uuid, uuid) from public, anon;
grant execute on function public.copiar_titular(uuid, uuid) to authenticated;
