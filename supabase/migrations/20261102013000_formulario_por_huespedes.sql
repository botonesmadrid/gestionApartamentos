-- Aplicada en producción el 2026-11-02.
-- El formulario de huéspedes se completa solo cuando están registrados todos los huéspedes
-- de la reserva (adultos + niños del aviso del canal). El contrato lo firma solo el titular.

alter table public.reservas add column if not exists num_huespedes int check (num_huespedes > 0);

-- Marca o desmarca el formulario según los huéspedes registrados.
create or replace function public.sincronizar_formulario(p_reserva uuid)
returns void language sql set search_path = '' as $$
  update public.reservas r set formulario_completado_at =
    case
      when r.num_huespedes is not null
       and (select count(*) from public.huespedes h where h.reserva_id = r.id) >= r.num_huespedes
        then coalesce(r.formulario_completado_at, now())
      else null
    end
  where r.id = p_reserva;
$$;
revoke execute on function public.sincronizar_formulario(uuid) from public, anon, authenticated;

create or replace function public.huespedes_sincronizar_formulario()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform public.sincronizar_formulario(new.reserva_id); end if;
  if tg_op in ('DELETE', 'UPDATE') then perform public.sincronizar_formulario(old.reserva_id); end if;
  return null;
end $$;
revoke execute on function public.huespedes_sincronizar_formulario() from public, anon, authenticated;
drop trigger if exists huespedes_sincronizar_formulario on public.huespedes;
create trigger huespedes_sincronizar_formulario
  after insert or delete or update of reserva_id on public.huespedes
  for each row execute function public.huespedes_sincronizar_formulario();

-- Si se corrige a mano el nº de huéspedes de una reserva, se recalcula.
create or replace function public.reservas_sincronizar_formulario()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.sincronizar_formulario(new.id);
  return null;
end $$;
revoke execute on function public.reservas_sincronizar_formulario() from public, anon, authenticated;
drop trigger if exists reservas_sincronizar_formulario on public.reservas;
create trigger reservas_sincronizar_formulario
  after update of num_huespedes on public.reservas
  for each row when (old.num_huespedes is distinct from new.num_huespedes)
  execute function public.reservas_sincronizar_formulario();

create or replace function public.registrar_aviso_canal(p jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_aviso public.avisos_canal;
  v_apto uuid;
  v_res public.reservas;
  v_origen text;
  v_neto numeric := nullif(p->>'precio_total', '')::numeric;
  v_entrada date := nullif(p->>'entrada', '')::date;
  v_salida date := nullif(p->>'salida', '')::date;
  v_tipo text := p->>'tipo';
  v_resultado text;
  v_detalle text;
  v_recibido timestamptz := coalesce(nullif(p->>'recibido_at','')::timestamptz, now());
  v_personas int := nullif(coalesce((p->>'adultos')::int, 0) + coalesce((p->>'ninos')::int, 0), 0);
begin
  insert into public.avisos_canal (canal, mensaje_id, recibido_at, asunto, cuerpo, datos)
  values (p->>'canal', p->>'mensaje_id', nullif(p->>'recibido_at','')::timestamptz,
          p->>'asunto', p->>'cuerpo', p - 'cuerpo')
  on conflict (mensaje_id) do nothing
  returning * into v_aviso;
  if v_aviso.id is null then
    return jsonb_build_object('resultado', 'duplicado');   -- ya procesado antes
  end if;

  select id into v_apto from public.apartamentos where nombre_en_canal = p->>'habitacion';
  v_origen := case lower(p->>'portal')
                when 'booking' then 'B' when 'airbnb' then 'A'
                when 'spotahome' then 'S' when 'directo' then 'D' end;

  if v_tipo not in ('alta', 'modificacion', 'cancelacion') then
    v_resultado := 'revisar'; v_detalle := 'tipo de aviso desconocido';
  elsif v_apto is null then
    v_resultado := 'revisar'; v_detalle := 'habitación sin piso asignado: ' || coalesce(p->>'habitacion', '(vacía)');
  elsif v_entrada is null or v_salida is null then
    v_resultado := 'revisar'; v_detalle := 'faltan fechas';
  end if;

  if v_resultado is null then
    -- Buscar la reserva: primero por código; si no, por piso + fechas (códigos mal tecleados en el histórico).
    select * into v_res from public.reservas
      where codigo_reserva = p->>'codigo' order by created_at limit 1;
    if v_res.id is null then
      select * into v_res from public.reservas
        where apartamento_id = v_apto and fecha_entrada = v_entrada and fecha_salida = v_salida
        order by created_at limit 1;
    end if;

    if v_res.id is not null and v_res.ultimo_aviso_at is not null and v_res.ultimo_aviso_at > v_recibido then
      -- Llega tarde un aviso más antiguo que el último aplicado: no debe deshacer cambios posteriores.
      v_resultado := 'obsoleto';
      v_detalle := 'aviso anterior al último aplicado a esta reserva (' || v_res.ultimo_aviso_at || ')';

    elsif v_tipo = 'cancelacion' then
      if v_res.id is null then
        insert into public.reservas (apartamento_id, fecha_reserva, fecha_entrada, fecha_salida, nombre,
          codigo_reserva, origen_codigo, origen_reserva, telefono, canal, estado, cancelada_at, ultimo_aviso_at, num_huespedes)
        values (v_apto, v_recibido::date, v_entrada, v_salida, coalesce(p->>'cliente', '(sin nombre)'),
          p->>'codigo', v_origen, p->>'portal', nullif(p->>'telefono',''), p->>'canal', 'cancelada', v_recibido, v_recibido, v_personas)
        returning * into v_res;
        v_detalle := 'cancelación de una reserva que no existía: se registra como cancelada';
      else
        update public.reservas set estado = 'cancelada', cancelada_at = v_recibido, importe_pendiente = false,
          codigo_reserva = coalesce(p->>'codigo', codigo_reserva), ultimo_aviso_at = v_recibido
        where id = v_res.id returning * into v_res;
      end if;
      v_resultado := 'cancelada';

    elsif v_res.id is null then
      insert into public.reservas (apartamento_id, fecha_reserva, fecha_entrada, fecha_salida, nombre,
        codigo_reserva, origen_codigo, origen_reserva, telefono, canal, estado,
        importe_neto, importe, importe_pendiente, ultimo_aviso_at, num_huespedes)
      values (v_apto, v_recibido::date, v_entrada, v_salida, coalesce(p->>'cliente', '(sin nombre)'),
        p->>'codigo', v_origen, p->>'portal', nullif(p->>'telefono',''), p->>'canal', 'confirmada',
        v_neto,
        case when v_origen = 'D' then v_neto end,           -- directas: sin comisión
        coalesce(v_origen, '') <> 'D', v_recibido, v_personas)
      returning * into v_res;
      v_resultado := 'creada';
      if v_tipo = 'modificacion' then v_detalle := 'modificación de una reserva que no existía: se crea'; end if;

    else
      update public.reservas set
        fecha_entrada = v_entrada,
        fecha_salida = v_salida,
        nombre = case when apellido1 is null then coalesce(p->>'cliente', nombre) else nombre end,
        codigo_reserva = coalesce(p->>'codigo', codigo_reserva),
        origen_codigo = coalesce(v_origen, origen_codigo),
        origen_reserva = coalesce(p->>'portal', origen_reserva),
        telefono = coalesce(nullif(p->>'telefono',''), telefono),
        canal = coalesce(canal, p->>'canal'),
        estado = 'confirmada',
        cancelada_at = null,
        ultimo_aviso_at = v_recibido,
        num_huespedes = coalesce(v_personas, num_huespedes),
        importe_neto = coalesce(v_neto, importe_neto),
        -- si el neto cambia, hay que revisar el importe con comisión (salvo directas)
        importe = case
          when coalesce(v_origen, origen_codigo) = 'D' then coalesce(v_neto, importe)
          -- histórico del Sheet con el neto apuntado como importe y sin comisión: el total no se conoce
          when comision_portal is null and importe = v_neto then null
          else importe end,
        importe_pendiente = case
          when coalesce(v_origen, origen_codigo) = 'D' then false
          when comision_portal is null and importe = v_neto then true
          when v_neto is not null
               and coalesce(importe_neto, importe - comision_portal) is distinct from v_neto then true
          when importe is null then true
          else importe_pendiente end
      where id = v_res.id returning * into v_res;
      perform public.sincronizar_formulario(v_res.id);   -- puede haber cambiado el nº de huéspedes
      v_resultado := 'actualizada';
    end if;
  end if;

  update public.avisos_canal set resultado = v_resultado, detalle = v_detalle,
    reserva_id = v_res.id, procesado_at = now()
  where id = v_aviso.id;

  return jsonb_build_object('resultado', v_resultado, 'detalle', v_detalle, 'reserva_id', v_res.id);
end $$;
revoke execute on function public.registrar_aviso_canal(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_aviso_canal(jsonb) to service_role;

-- Datos existentes
-- Avirato: nº de huéspedes del último aviso aplicado.
update public.reservas r set num_huespedes = x.personas
from (
  select distinct on (reserva_id) reserva_id,
    nullif(coalesce((datos->>'adultos')::int, 0) + coalesce((datos->>'ninos')::int, 0), 0) personas
  from public.avisos_canal where reserva_id is not null and resultado <> 'obsoleto'
  order by reserva_id, recibido_at desc
) x where r.id = x.reserva_id and r.num_huespedes is null;
-- Sheet: los huéspedes ya registrados.
update public.reservas r set num_huespedes = x.n
from (select reserva_id, count(*)::int n from public.huespedes group by 1) x
where r.id = x.reserva_id and r.num_huespedes is null;
