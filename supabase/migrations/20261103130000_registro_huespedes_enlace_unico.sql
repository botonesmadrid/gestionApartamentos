-- Aplicada en producción el 2026-11-03 (en tres pasos: registro_por_propiedad, registro_enlace_unico y registro_titular_por_nombre).
-- Formulario de huéspedes con un único enlace fijo (/registro), para las plantillas de mensajes de los portales.
-- Los huéspedes rellenan de una vez su estancia y los datos de todos ellos (el primero es el titular, quien hizo la
-- reserva). El envío se vincula solo a la entrada si hay exactamente una entrada con esa fecha de entrada (o ±1 día)
-- cuya cabecera coincide con el nombre de uno de los huéspedes; si no, queda pendiente para asignarlo a mano.
-- (Primero se hizo con un enlace por propiedad; al final de este archivo se cambia a un único enlace.)

-- Envíos del formulario. Una vez vinculados se guardan solo los nombres (los datos completos están en huespedes).
create table if not exists public.registros_huespedes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  fecha_entrada date not null,
  fecha_salida date,
  num_huespedes int not null,
  huespedes jsonb not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'vinculado', 'descartado')),
  reserva_id uuid,                        -- entrada a la que se vinculó (sin FK: la entrada puede eliminarse)
  vinculacion text,                       -- 'automatica' o 'manual'
  created_at timestamptz not null default now(),
  resuelto_at timestamptz
);
create index if not exists registros_huespedes_pendientes on public.registros_huespedes (estado, fecha_entrada);
alter table public.registros_huespedes enable row level security;
create policy "gestor acceso total registros_huespedes" on public.registros_huespedes
  for all using (public.es_gestor()) with check (public.es_gestor());

-- Texto normalizado para comparar nombres: minúsculas, sin acentos, solo letras y números separados por espacios.
create or replace function public._normalizar_nombre(p text)
returns text language sql immutable set search_path = '' as $$
  select trim(regexp_replace(lower(translate(coalesce(p, ''),
    'áàâäãåéèêëíìîïóòôöõøúùûüñçÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕØÚÙÛÜÑÇ',
    'aaaaaaeeeeiiiioooooouuuuncAAAAAAEEEEIIIIOOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g'));
$$;

-- ¿El huésped es la persona de la cabecera de la entrada? Nombre y primer apellido del huésped en la cabecera,
-- o todas las palabras de la cabecera (al menos dos) en el nombre completo del huésped (cubre nombres invertidos).
create or replace function public._es_titular_de(p_res_nombre text, p_res_ap1 text, p_nombre text, p_ap1 text, p_ap2 text)
returns boolean language sql immutable set search_path = '' as $$
  with c as (
    select string_to_array(public._normalizar_nombre(concat_ws(' ', p_res_nombre, p_res_ap1)), ' ') cab,
           string_to_array(public._normalizar_nombre(concat_ws(' ', p_nombre, p_ap1, p_ap2)), ' ') hue,
           split_part(public._normalizar_nombre(p_nombre), ' ', 1) n1,
           split_part(public._normalizar_nombre(p_ap1), ' ', 1) a1
  )
  select (n1 <> '' and a1 <> '' and n1 = any(cab) and a1 = any(cab))
      or (cardinality(array_remove(cab, '')) >= 2 and array_remove(cab, '') <@ hue)
  from c;
$$;

-- Validación de un huésped (la misma que formulario_registrar). Devuelve null si es válido o el error.
create or replace function public._validar_huesped(p jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_falta text[] := '{}'; v_campo text;
begin
  foreach v_campo in array array['nombre','apellido1','sexo_codigo','fecha_nacimiento','tipo_documento_codigo',
      'numero_documento','nacionalidad_codigo','direccion','codigo_postal','pais_codigo',
      'parentesco_codigo','telefono','correo','motivo_viaje'] loop
    if coalesce(trim(p->>v_campo), '') = '' then v_falta := array_append(v_falta, v_campo); end if;
  end loop;
  if p->>'nacionalidad_codigo' = 'ESP' and coalesce(trim(p->>'apellido2'), '') = '' then v_falta := array_append(v_falta, 'apellido2'); end if;
  if p->>'tipo_documento_codigo' in ('NIF', 'NIE') and coalesce(trim(p->>'soporte_documento'), '') = '' then
    v_falta := array_append(v_falta, 'soporte_documento');
  end if;
  if p->>'pais_codigo' = 'ESP' and coalesce(p->>'codigo_municipio_ref', '') = '' then v_falta := array_append(v_falta, 'codigo_municipio_ref'); end if;
  if p->>'pais_codigo' <> 'ESP' and coalesce(trim(p->>'nombre_municipio'), '') = '' then v_falta := array_append(v_falta, 'nombre_municipio'); end if;
  if coalesce((p->>'consentimiento')::boolean, false) is not true then v_falta := array_append(v_falta, 'consentimiento'); end if;
  if array_length(v_falta, 1) > 0 then return jsonb_build_object('error', 'faltan_campos', 'campos', to_jsonb(v_falta)); end if;
  if (p->>'fecha_nacimiento')::date > current_date or (p->>'fecha_nacimiento')::date < date '1900-01-01' then
    return jsonb_build_object('error', 'fecha_nacimiento');
  end if;
  return null;
end $$;
revoke execute on function public._validar_huesped(jsonb) from public, anon, authenticated;

-- Pasa los huéspedes de un envío a una entrada (sin repetir documentos ya registrados en ella).
create or replace function public._vincular_registro(p_registro uuid, p_reserva uuid, p_modo text)
returns int language plpgsql security definer set search_path = '' as $$
declare g record; r public.reservas; v_id uuid; v_titular uuid; v_n int := 0; v_municipio text;
begin
  select * into r from public.reservas where id = p_reserva for update;
  if r.id is null then raise exception 'No se encuentra la entrada'; end if;

  for g in select value p, ordinality i from jsonb_array_elements((select huespedes from public.registros_huespedes where id = p_registro)) with ordinality loop
    if exists (select 1 from public.huespedes h where h.reserva_id = r.id
               and h.numero_documento = upper(regexp_replace(g.p->>'numero_documento', '[\s-]', '', 'g'))) then
      continue;
    end if;
    v_municipio := null;
    if g.p->>'pais_codigo' = 'ESP' then
      select nombre into v_municipio from public.municipios where codigo = g.p->>'codigo_municipio_ref';
    end if;
    insert into public.huespedes (reserva_id, nombre, apellido1, apellido2, sexo_codigo, fecha_nacimiento,
      tipo_documento_codigo, numero_documento, soporte_documento, nacionalidad_codigo, direccion, codigo_postal,
      pais_codigo, codigo_municipio_ref, nombre_municipio, parentesco_codigo, telefono, correo, motivo_viaje,
      rol, consentimiento_at, origen_datos)
    values (r.id, trim(g.p->>'nombre'), trim(g.p->>'apellido1'), nullif(trim(g.p->>'apellido2'), ''),
      g.p->>'sexo_codigo', (g.p->>'fecha_nacimiento')::date,
      g.p->>'tipo_documento_codigo', upper(regexp_replace(g.p->>'numero_documento', '[\s-]', '', 'g')),
      nullif(upper(trim(g.p->>'soporte_documento')), ''),
      g.p->>'nacionalidad_codigo', trim(g.p->>'direccion'), trim(g.p->>'codigo_postal'),
      g.p->>'pais_codigo', case when g.p->>'pais_codigo' = 'ESP' then g.p->>'codigo_municipio_ref' end,
      case when g.p->>'pais_codigo' = 'ESP' then v_municipio else trim(g.p->>'nombre_municipio') end,
      g.p->>'parentesco_codigo', trim(g.p->>'telefono'), lower(trim(g.p->>'correo')), g.p->>'motivo_viaje',
      'VI', now(), 'formulario_propiedad')
    returning id into v_id;
    v_n := v_n + 1;
    -- Titular: el huésped que coincide con la cabecera; si ninguno coincide, el primero del formulario.
    if public._es_titular_de(r.nombre, r.apellido1, g.p->>'nombre', g.p->>'apellido1', g.p->>'apellido2') then
      v_titular := v_id;
    elsif g.i = 1 and v_titular is null then
      v_titular := v_id;
    end if;
  end loop;

  if r.titular_huesped_id is null and v_titular is not null then
    update public.reservas set titular_huesped_id = v_titular where id = r.id;
  end if;
  update public.reservas res set num_huespedes = greatest(coalesce(res.num_huespedes, 0),
      (select count(*) from public.huespedes h where h.reserva_id = res.id))::int
  where res.id = r.id;
  update public.reservas set formulario_enviado_at = coalesce(formulario_enviado_at, now()) where id = r.id;

  -- Una vez vinculado solo se guardan los nombres del envío (los datos ya están en la entrada).
  update public.registros_huespedes rh set estado = 'vinculado', reserva_id = r.id, vinculacion = p_modo, resuelto_at = now(),
    huespedes = (select jsonb_agg(jsonb_build_object('nombre', x->>'nombre', 'apellido1', x->>'apellido1', 'apellido2', x->>'apellido2'))
                 from jsonb_array_elements(rh.huespedes) x)
  where rh.id = p_registro;
  return v_n;
end $$;
revoke execute on function public._vincular_registro(uuid, uuid, text) from public, anon, authenticated;

-- Datos para el formulario público de una propiedad.
create or replace function public.registro_catalogos(p_cliente text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when c.id is null then jsonb_build_object('estado', 'no_encontrado') else jsonb_build_object(
    'estado', 'ok',
    'propiedad', c.nombre,
    'paises', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre) order by nombre) from public.paises),
    'tipos_documento', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.tipos_documento),
    'sexos', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.sexos),
    'parentescos', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.parentescos)
  ) end
  from (select 1) x left join public.clientes c on upper(c.codigo) = upper(trim(p_cliente)) and c.activo;
$$;
grant execute on function public.registro_catalogos(text) to anon, authenticated;

create or replace function public.registro_municipios(p_cliente text, p_q text)
returns table(codigo text, nombre text) language sql stable security definer set search_path = '' as $$
  select m.codigo, m.nombre from public.municipios m
  where exists (select 1 from public.clientes c where upper(c.codigo) = upper(trim(p_cliente)) and c.activo)
    and length(trim(coalesce(p_q, ''))) >= 2
    and m.codigo <> 'NOESP'
    and m.nombre ilike '%' || replace(replace(trim(p_q), '%', ''), '_', '') || '%'
  order by m.nombre limit 20;
$$;
grant execute on function public.registro_municipios(text, text) to anon, authenticated;

-- Envío del formulario público. Al huésped siempre se le confirma igual (vinculado o pendiente).
create or replace function public.registro_enviar(p_cliente text, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare c public.clientes; v_entrada date; v_salida date; v_hs jsonb; v_n int; g jsonb; v_err jsonb; i int := 0;
        v_id uuid; v_reserva uuid; v_candidatas uuid[];
begin
  select * into c from public.clientes where upper(codigo) = upper(trim(p_cliente)) and activo;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'no_encontrado'); end if;
  if (select count(*) from public.registros_huespedes where created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'demasiados_envios');
  end if;

  begin
    v_entrada := (p->>'fecha_entrada')::date;
    v_salida := (p->>'fecha_salida')::date;
  exception when others then return jsonb_build_object('ok', false, 'error', 'fechas');
  end;
  if v_entrada is null or v_salida is null or v_salida <= v_entrada
     or v_entrada < current_date - 30 or v_entrada > current_date + 400 then
    return jsonb_build_object('ok', false, 'error', 'fechas');
  end if;

  v_hs := p->'huespedes';
  v_n := coalesce(jsonb_array_length(case when jsonb_typeof(v_hs) = 'array' then v_hs end), 0);
  if v_n < 1 or v_n > 20 then return jsonb_build_object('ok', false, 'error', 'huespedes'); end if;
  for g in select value from jsonb_array_elements(v_hs) loop
    i := i + 1;
    v_err := public._validar_huesped(g);
    if v_err is not null then return jsonb_build_object('ok', false, 'error', 'huesped', 'huesped', i, 'detalle', v_err); end if;
  end loop;

  insert into public.registros_huespedes (cliente_id, fecha_entrada, fecha_salida, num_huespedes, huespedes)
  values (c.id, v_entrada, v_salida, v_n, v_hs) returning id into v_id;

  -- Entradas de la propiedad con esa fecha de entrada cuya cabecera es uno de los huéspedes (primero el día exacto).
  for v_margen in 0..1 loop
    select array_agg(distinct r.id) into v_candidatas
    from public.reservas r join public.apartamentos a on a.id = r.apartamento_id
    where a.cliente_id = c.id and r.estado <> 'cancelada'
      and abs(r.fecha_entrada - v_entrada) <= v_margen
      and exists (select 1 from jsonb_array_elements(v_hs) x
                  where public._es_titular_de(r.nombre, r.apellido1, x->>'nombre', x->>'apellido1', x->>'apellido2'));
    exit when coalesce(array_length(v_candidatas, 1), 0) > 0;
  end loop;

  if coalesce(array_length(v_candidatas, 1), 0) = 1 then
    v_reserva := v_candidatas[1];
    perform public._vincular_registro(v_id, v_reserva, 'automatica');
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.registro_enviar(text, jsonb) to anon, authenticated;

-- Gestores: asignar a mano un envío pendiente a una entrada, o descartarlo (se borran sus datos personales).
create or replace function public.asignar_registro(p_registro uuid, p_reserva uuid)
returns int language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  if not exists (select 1 from public.registros_huespedes where id = p_registro and estado = 'pendiente') then
    raise exception 'El registro ya no está pendiente';
  end if;
  return public._vincular_registro(p_registro, p_reserva, 'manual');
end $$;
revoke execute on function public.asignar_registro(uuid, uuid) from public, anon;
grant execute on function public.asignar_registro(uuid, uuid) to authenticated;

create or replace function public.descartar_registro(p_registro uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  update public.registros_huespedes rh set estado = 'descartado', resuelto_at = now(),
    huespedes = (select jsonb_agg(jsonb_build_object('nombre', x->>'nombre', 'apellido1', x->>'apellido1'))
                 from jsonb_array_elements(rh.huespedes) x)
  where rh.id = p_registro and rh.estado = 'pendiente';
end $$;
revoke execute on function public.descartar_registro(uuid) from public, anon;
grant execute on function public.descartar_registro(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Cambio (mismo día): un único enlace para todas las propiedades (/registro). La propiedad no se pide: el envío se
-- compara con las entradas de todas las propiedades activas por nombre y fecha de entrada. Las funciones con
-- p_cliente quedan sin uso.
alter table public.registros_huespedes alter column cliente_id drop not null;

create or replace function public.registro_catalogos()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'estado', 'ok',
    'paises', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre) order by nombre) from public.paises),
    'tipos_documento', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.tipos_documento),
    'sexos', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.sexos),
    'parentescos', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.parentescos));
$$;
grant execute on function public.registro_catalogos() to anon, authenticated;

create or replace function public.registro_municipios(p_q text)
returns table(codigo text, nombre text) language sql stable security definer set search_path = '' as $$
  select m.codigo, m.nombre from public.municipios m
  where length(trim(coalesce(p_q, ''))) >= 2
    and m.codigo <> 'NOESP'
    and m.nombre ilike '%' || replace(replace(trim(p_q), '%', ''), '_', '') || '%'
  order by m.nombre limit 20;
$$;
grant execute on function public.registro_municipios(text) to anon, authenticated;

create or replace function public.registro_enviar(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_entrada date; v_salida date; v_hs jsonb; v_n int; g jsonb; v_err jsonb; i int := 0;
        v_id uuid; v_candidatas uuid[];
begin
  if (select count(*) from public.registros_huespedes where created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'demasiados_envios');
  end if;
  begin
    v_entrada := (p->>'fecha_entrada')::date;
    v_salida := (p->>'fecha_salida')::date;
  exception when others then return jsonb_build_object('ok', false, 'error', 'fechas');
  end;
  if v_entrada is null or v_salida is null or v_salida <= v_entrada
     or v_entrada < current_date - 30 or v_entrada > current_date + 400 then
    return jsonb_build_object('ok', false, 'error', 'fechas');
  end if;

  v_hs := p->'huespedes';
  v_n := coalesce(jsonb_array_length(case when jsonb_typeof(v_hs) = 'array' then v_hs end), 0);
  if v_n < 1 or v_n > 20 then return jsonb_build_object('ok', false, 'error', 'huespedes'); end if;
  for g in select value from jsonb_array_elements(v_hs) loop
    i := i + 1;
    v_err := public._validar_huesped(g);
    if v_err is not null then return jsonb_build_object('ok', false, 'error', 'huesped', 'huesped', i, 'detalle', v_err); end if;
  end loop;

  insert into public.registros_huespedes (fecha_entrada, fecha_salida, num_huespedes, huespedes)
  values (v_entrada, v_salida, v_n, v_hs) returning id into v_id;

  -- Entradas (de cualquier propiedad activa) con esa fecha de entrada cuya cabecera es uno de los huéspedes;
  -- primero el día exacto y, si no hay ninguna, ±1 día.
  for v_margen in 0..1 loop
    select array_agg(distinct r.id) into v_candidatas
    from public.reservas r
    join public.apartamentos a on a.id = r.apartamento_id
    join public.clientes c on c.id = a.cliente_id and c.activo
    where r.estado <> 'cancelada'
      and abs(r.fecha_entrada - v_entrada) <= v_margen
      and exists (select 1 from jsonb_array_elements(v_hs) x
                  where public._es_titular_de(r.nombre, r.apellido1, x->>'nombre', x->>'apellido1', x->>'apellido2'));
    exit when coalesce(array_length(v_candidatas, 1), 0) > 0;
  end loop;

  if coalesce(array_length(v_candidatas, 1), 0) = 1 then
    update public.registros_huespedes set cliente_id =
      (select a.cliente_id from public.reservas r join public.apartamentos a on a.id = r.apartamento_id where r.id = v_candidatas[1])
    where id = v_id;
    perform public._vincular_registro(v_id, v_candidatas[1], 'automatica');
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.registro_enviar(jsonb) to anon, authenticated;

-- Al asignar a mano, el envío toma la propiedad de la entrada.
create or replace function public.asignar_registro(p_registro uuid, p_reserva uuid)
returns int language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  if not exists (select 1 from public.registros_huespedes where id = p_registro and estado = 'pendiente') then
    raise exception 'El registro ya no está pendiente';
  end if;
  update public.registros_huespedes set cliente_id =
    (select a.cliente_id from public.reservas r join public.apartamentos a on a.id = r.apartamento_id where r.id = p_reserva)
  where id = p_registro;
  return public._vincular_registro(p_registro, p_reserva, 'manual');
end $$;

-- Cambio (mismo día): el titular es el huésped cuyo nombre coincide con el de la entrada (no el primero del
-- formulario). Si ninguno coincide (asignación manual), no se marca titular. Tampoco se repite un huésped que ya
-- esté en la entrada con el mismo documento, o con el mismo nombre y fecha de nacimiento.
create or replace function public._vincular_registro(p_registro uuid, p_reserva uuid, p_modo text)
returns int language plpgsql security definer set search_path = '' as $$
declare g record; r public.reservas; v_id uuid; v_titular uuid; v_n int := 0; v_municipio text;
begin
  select * into r from public.reservas where id = p_reserva for update;
  if r.id is null then raise exception 'No se encuentra la entrada'; end if;

  for g in select value p from jsonb_array_elements((select huespedes from public.registros_huespedes where id = p_registro)) loop
    if exists (select 1 from public.huespedes h where h.reserva_id = r.id
               and (h.numero_documento = upper(regexp_replace(g.p->>'numero_documento', '[\s-]', '', 'g'))
                    or (public._normalizar_nombre(concat_ws(' ', h.nombre, h.apellido1))
                          = public._normalizar_nombre(concat_ws(' ', g.p->>'nombre', g.p->>'apellido1'))
                        and h.fecha_nacimiento = (g.p->>'fecha_nacimiento')::date))) then
      continue;
    end if;
    v_municipio := null;
    if g.p->>'pais_codigo' = 'ESP' then
      select nombre into v_municipio from public.municipios where codigo = g.p->>'codigo_municipio_ref';
    end if;
    insert into public.huespedes (reserva_id, nombre, apellido1, apellido2, sexo_codigo, fecha_nacimiento,
      tipo_documento_codigo, numero_documento, soporte_documento, nacionalidad_codigo, direccion, codigo_postal,
      pais_codigo, codigo_municipio_ref, nombre_municipio, parentesco_codigo, telefono, correo, motivo_viaje,
      rol, consentimiento_at, origen_datos)
    values (r.id, trim(g.p->>'nombre'), trim(g.p->>'apellido1'), nullif(trim(g.p->>'apellido2'), ''),
      g.p->>'sexo_codigo', (g.p->>'fecha_nacimiento')::date,
      g.p->>'tipo_documento_codigo', upper(regexp_replace(g.p->>'numero_documento', '[\s-]', '', 'g')),
      nullif(upper(trim(g.p->>'soporte_documento')), ''),
      g.p->>'nacionalidad_codigo', trim(g.p->>'direccion'), trim(g.p->>'codigo_postal'),
      g.p->>'pais_codigo', case when g.p->>'pais_codigo' = 'ESP' then g.p->>'codigo_municipio_ref' end,
      case when g.p->>'pais_codigo' = 'ESP' then v_municipio else trim(g.p->>'nombre_municipio') end,
      g.p->>'parentesco_codigo', trim(g.p->>'telefono'), lower(trim(g.p->>'correo')), g.p->>'motivo_viaje',
      'VI', now(), 'formulario_enlace_unico')
    returning id into v_id;
    v_n := v_n + 1;
    if v_titular is null and public._es_titular_de(r.nombre, r.apellido1, g.p->>'nombre', g.p->>'apellido1', g.p->>'apellido2') then
      v_titular := v_id;
    end if;
  end loop;

  if r.titular_huesped_id is null and v_titular is not null then
    update public.reservas set titular_huesped_id = v_titular where id = r.id;
  end if;
  update public.reservas res set num_huespedes = greatest(coalesce(res.num_huespedes, 0),
      (select count(*) from public.huespedes h where h.reserva_id = res.id))::int
  where res.id = r.id;
  update public.reservas set formulario_enviado_at = coalesce(formulario_enviado_at, now()) where id = r.id;

  update public.registros_huespedes rh set estado = 'vinculado', reserva_id = r.id, vinculacion = p_modo, resuelto_at = now(),
    huespedes = (select jsonb_agg(jsonb_build_object('nombre', x->>'nombre', 'apellido1', x->>'apellido1', 'apellido2', x->>'apellido2'))
                 from jsonb_array_elements(rh.huespedes) x)
  where rh.id = p_registro;
  return v_n;
end $$;
revoke execute on function public._vincular_registro(uuid, uuid, text) from public, anon, authenticated;
