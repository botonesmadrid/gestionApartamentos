-- Aplicada en producción el 2026-11-02.
-- 1. Un aviso más antiguo que el último aplicado a una reserva ya no la modifica (resultado 'obsoleto').
-- 2. Reservas del Sheet cuyo "importe" era en realidad el neto (sin comisión): el total queda pendiente.

alter table public.reservas add column if not exists ultimo_aviso_at timestamptz;
alter table public.avisos_canal drop constraint if exists avisos_canal_resultado_check;
alter table public.avisos_canal add constraint avisos_canal_resultado_check
  check (resultado in ('pendiente', 'creada', 'actualizada', 'cancelada', 'revisar', 'obsoleto'));

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
          codigo_reserva, origen_codigo, origen_reserva, telefono, canal, estado, cancelada_at, ultimo_aviso_at)
        values (v_apto, v_recibido::date, v_entrada, v_salida, coalesce(p->>'cliente', '(sin nombre)'),
          p->>'codigo', v_origen, p->>'portal', nullif(p->>'telefono',''), p->>'canal', 'cancelada', v_recibido, v_recibido)
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
        importe_neto, importe, importe_pendiente, ultimo_aviso_at)
      values (v_apto, v_recibido::date, v_entrada, v_salida, coalesce(p->>'cliente', '(sin nombre)'),
        p->>'codigo', v_origen, p->>'portal', nullif(p->>'telefono',''), p->>'canal', 'confirmada',
        v_neto,
        case when v_origen = 'D' then v_neto end,           -- directas: sin comisión
        coalesce(v_origen, '') <> 'D', v_recibido)
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
