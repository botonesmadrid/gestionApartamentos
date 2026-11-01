-- Aplicada en producción el 2026-11-02.
-- Formulario público de huéspedes: un enlace secreto por reserva (/f/<token>).
-- El público (rol anon) no tiene acceso a ninguna tabla: solo a estas funciones,
-- que comprueban el token y devuelven/guardan únicamente lo necesario.

alter table public.reservas
  add column if not exists formulario_token uuid not null default gen_random_uuid();
create unique index if not exists reservas_formulario_token_idx on public.reservas (formulario_token);

alter table public.huespedes
  add column if not exists motivo_viaje text,
  add column if not exists consentimiento_at timestamptz,
  add column if not exists origen_datos text;          -- 'sheet', 'formulario', 'gestor'

-- Datos de la reserva y catálogos para pintar el formulario.
create or replace function public.formulario_obtener(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select res.id, res.fecha_entrada, res.fecha_salida, res.num_huespedes, res.estado, res.nombre,
         a.piso, (select count(*) from public.huespedes h where h.reserva_id = res.id) registrados,
         (select coalesce(jsonb_agg(h.nombre order by h.created_at), '[]') from public.huespedes h where h.reserva_id = res.id) nombres
    into r
  from public.reservas res join public.apartamentos a on a.id = res.apartamento_id
  where res.formulario_token = p_token;

  if r.id is null then return jsonb_build_object('estado', 'no_encontrado'); end if;
  if r.estado = 'cancelada' or r.fecha_salida < current_date then
    return jsonb_build_object('estado', 'cerrado');
  end if;

  return jsonb_build_object(
    'estado', 'ok',
    'titular', split_part(r.nombre, ' ', 1),
    'piso', r.piso,
    'fecha_entrada', r.fecha_entrada,
    'fecha_salida', r.fecha_salida,
    'num_huespedes', r.num_huespedes,
    'registrados', r.registrados,
    'nombres_registrados', r.nombres,
    'paises', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre) order by nombre) from public.paises),
    'tipos_documento', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.tipos_documento),
    'sexos', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.sexos),
    'parentescos', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion) order by descripcion) from public.parentescos)
  );
end $$;

-- Búsqueda de municipios españoles (son 8.000: no se mandan todos).
create or replace function public.formulario_municipios(p_token uuid, p_q text)
returns table (codigo text, nombre text) language sql stable security definer set search_path = '' as $$
  select m.codigo, m.nombre from public.municipios m
  where exists (select 1 from public.reservas r where r.formulario_token = p_token)
    and length(trim(coalesce(p_q, ''))) >= 2
    and m.codigo <> 'NOESP'
    and m.nombre ilike '%' || replace(replace(trim(p_q), '%', ''), '_', '') || '%'
  order by m.nombre limit 20;
$$;

-- Registra un huésped. Valida token, estado, plazas y campos obligatorios.
create or replace function public.formulario_registrar(p_token uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_res record;
  v_registrados int;
  v_falta text[] := '{}';
  v_campo text;
  v_es_esp_nac boolean := p->>'nacionalidad_codigo' = 'ESP';
  v_es_esp_res boolean := p->>'pais_codigo' = 'ESP';
  v_municipio text;
begin
  select id, estado, fecha_salida, num_huespedes into v_res
  from public.reservas where formulario_token = p_token for update;
  if v_res.id is null then return jsonb_build_object('ok', false, 'error', 'no_encontrado'); end if;
  if v_res.estado = 'cancelada' or v_res.fecha_salida < current_date then
    return jsonb_build_object('ok', false, 'error', 'cerrado');
  end if;

  select count(*) into v_registrados from public.huespedes where reserva_id = v_res.id;
  if v_res.num_huespedes is not null and v_registrados >= v_res.num_huespedes then
    return jsonb_build_object('ok', false, 'error', 'completo');
  end if;

  foreach v_campo in array array['nombre','apellido1','sexo_codigo','fecha_nacimiento','tipo_documento_codigo',
      'numero_documento','nacionalidad_codigo','direccion','codigo_postal','pais_codigo',
      'parentesco_codigo','telefono','correo','motivo_viaje'] loop
    if coalesce(trim(p->>v_campo), '') = '' then v_falta := array_append(v_falta, v_campo); end if;
  end loop;
  if v_es_esp_nac and coalesce(trim(p->>'apellido2'), '') = '' then v_falta := array_append(v_falta, 'apellido2'); end if;
  if p->>'tipo_documento_codigo' in ('NIF', 'NIE') and coalesce(trim(p->>'soporte_documento'), '') = '' then
    v_falta := array_append(v_falta, 'soporte_documento');
  end if;
  if v_es_esp_res and coalesce(p->>'codigo_municipio_ref', '') = '' then v_falta := array_append(v_falta, 'codigo_municipio_ref'); end if;
  if not v_es_esp_res and coalesce(trim(p->>'nombre_municipio'), '') = '' then v_falta := array_append(v_falta, 'nombre_municipio'); end if;
  if coalesce((p->>'consentimiento')::boolean, false) is not true then v_falta := array_append(v_falta, 'consentimiento'); end if;
  if array_length(v_falta, 1) > 0 then
    return jsonb_build_object('ok', false, 'error', 'faltan_campos', 'campos', to_jsonb(v_falta));
  end if;
  if (p->>'fecha_nacimiento')::date > current_date or (p->>'fecha_nacimiento')::date < date '1900-01-01' then
    return jsonb_build_object('ok', false, 'error', 'fecha_nacimiento');
  end if;

  if v_es_esp_res then
    select nombre into v_municipio from public.municipios where codigo = p->>'codigo_municipio_ref';
  end if;

  insert into public.huespedes (reserva_id, nombre, apellido1, apellido2, sexo_codigo, fecha_nacimiento,
    tipo_documento_codigo, numero_documento, soporte_documento, nacionalidad_codigo, direccion, codigo_postal,
    pais_codigo, codigo_municipio_ref, nombre_municipio, parentesco_codigo, telefono, correo, motivo_viaje,
    rol, consentimiento_at, origen_datos)
  values (v_res.id, trim(p->>'nombre'), trim(p->>'apellido1'), nullif(trim(p->>'apellido2'), ''),
    p->>'sexo_codigo', (p->>'fecha_nacimiento')::date,
    p->>'tipo_documento_codigo', upper(regexp_replace(p->>'numero_documento', '[\s-]', '', 'g')),
    nullif(upper(trim(p->>'soporte_documento')), ''),
    p->>'nacionalidad_codigo', trim(p->>'direccion'), trim(p->>'codigo_postal'),
    p->>'pais_codigo', case when v_es_esp_res then p->>'codigo_municipio_ref' end,
    case when v_es_esp_res then v_municipio else trim(p->>'nombre_municipio') end,
    p->>'parentesco_codigo', trim(p->>'telefono'), lower(trim(p->>'correo')), p->>'motivo_viaje',
    'VI', now(), 'formulario');

  return jsonb_build_object('ok', true, 'registrados', v_registrados + 1, 'num_huespedes', v_res.num_huespedes);
end $$;

revoke execute on function public.formulario_obtener(uuid) from public;
revoke execute on function public.formulario_municipios(uuid, text) from public;
revoke execute on function public.formulario_registrar(uuid, jsonb) from public;
grant execute on function public.formulario_obtener(uuid) to anon, authenticated;
grant execute on function public.formulario_municipios(uuid, text) to anon, authenticated;
grant execute on function public.formulario_registrar(uuid, jsonb) to anon, authenticated;

update public.huespedes set origen_datos = 'sheet' where origen_datos is null;
