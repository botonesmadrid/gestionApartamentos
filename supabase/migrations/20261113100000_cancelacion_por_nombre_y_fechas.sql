-- Cancelaciones cuyo código no coincide con el de la reserva (p. ej. Booking 5712003778 cancela la 5738441570,
-- hecha dos minutos antes por la misma huésped) y que no traen Room Id: se quedaban en "revisar".
-- Si el código no aparece, se busca una única reserva activa con el mismo nombre y las mismas fechas y se cancela.
-- Al cancelar se conserva el código original de la reserva.

create or replace function public.registrar_aviso_canal(p jsonb)
returns jsonb language plpgsql set search_path to '' as $function$
declare
  v_aviso public.avisos_canal;
  v_apto uuid;
  v_res public.reservas;
  v_origen text;
  v_precio numeric := nullif(p->>'precio_total', '')::numeric;   -- Booking: con comisión; resto: neto
  v_entrada date := nullif(p->>'entrada', '')::date;
  v_salida date := nullif(p->>'salida', '')::date;
  v_tipo text := p->>'tipo';
  v_resultado text;
  v_detalle text;
  v_recibido timestamptz := coalesce(nullif(p->>'recibido_at','')::timestamptz, now());
  v_personas int := nullif(coalesce((p->>'adultos')::int, 0) + coalesce((p->>'ninos')::int, 0), 0);
  v_booking boolean;
  v_comision numeric := nullif(p->>'comision', '')::numeric;   -- si el aviso trae la comisión (Little Hotelier)
  v_por_nombre boolean := false;
begin
  insert into public.avisos_canal (canal, mensaje_id, recibido_at, asunto, cuerpo, datos)
  values (p->>'canal', p->>'mensaje_id', nullif(p->>'recibido_at','')::timestamptz,
          p->>'asunto', p->>'cuerpo', p - 'cuerpo')
  on conflict (mensaje_id) do nothing
  returning * into v_aviso;
  if v_aviso.id is null then
    return jsonb_build_object('resultado', 'duplicado');   -- ya procesado antes
  end if;

  -- Piso: por el nombre de la habitación en el canal (Avirato) o por su Room Id (Little Hotelier).
  select id into v_apto from public.apartamentos
  where (nullif(p->>'habitacion', '') is not null and nombre_en_canal = p->>'habitacion')
     or (nullif(p->>'room_id', '') is not null and room_id_canal = p->>'room_id')
  limit 1;
  -- Sin piso en el aviso (las cancelaciones de Little Hotelier no traen Room Id): el de la reserva con ese código.
  if v_apto is null and nullif(p->>'codigo', '') is not null then
    select apartamento_id into v_apto from public.reservas
    where codigo_reserva = p->>'codigo' order by created_at limit 1;
  end if;
  -- Cancelación sin piso ni código conocido: una única reserva activa con el mismo nombre y las mismas fechas.
  if v_apto is null and v_tipo = 'cancelacion' and v_entrada is not null and v_salida is not null
     and nullif(trim(p->>'cliente'), '') is not null then
    select (array_agg(apartamento_id))[1] into v_apto from public.reservas
    where fecha_entrada = v_entrada and fecha_salida = v_salida and estado <> 'cancelada'
      and lower(trim(nombre)) = lower(trim(p->>'cliente'))
    having count(*) = 1;
    v_por_nombre := v_apto is not null;
  end if;
  v_origen := case lower(p->>'portal')
                when 'booking' then 'B' when 'airbnb' then 'A'
                when 'spotahome' then 'S' when 'directo' then 'D' end;

  if v_tipo not in ('alta', 'modificacion', 'cancelacion') then
    v_resultado := 'revisar'; v_detalle := 'tipo de aviso desconocido';
  elsif v_apto is null and nullif(p->>'habitacion', '') is null and nullif(p->>'room_id', '') is null then
    v_resultado := 'revisar';
    v_detalle := case when v_tipo = 'cancelacion'
      then 'cancelación de una reserva que no está en la app (el aviso no indica la habitación)'
      else 'el aviso no indica la habitación' end;
  elsif v_apto is null then
    v_resultado := 'revisar'; v_detalle := 'habitación sin piso asignado: ' || coalesce(p->>'habitacion', 'Room Id ' || (p->>'room_id'), '(vacía)');
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
          codigo_reserva = coalesce(codigo_reserva, p->>'codigo'), ultimo_aviso_at = v_recibido
        where id = v_res.id returning * into v_res;
        if v_por_nombre then
          v_detalle := 'código ' || (p->>'codigo') || ' no encontrado: cancelada la reserva con el mismo nombre y fechas';
        end if;
      end if;
      v_resultado := 'cancelada';

    elsif v_res.id is null then
      insert into public.reservas (apartamento_id, fecha_reserva, fecha_entrada, fecha_salida, nombre,
        codigo_reserva, origen_codigo, origen_reserva, telefono, canal, estado,
        importe_neto, importe, importe_pendiente, ultimo_aviso_at, num_huespedes)
      values (v_apto, v_recibido::date, v_entrada, v_salida, coalesce(p->>'cliente', '(sin nombre)'),
        p->>'codigo', v_origen, p->>'portal', nullif(p->>'telefono',''), p->>'canal', 'confirmada',
        case when v_origen = 'B' then v_precio - v_comision else v_precio end, -- neto (Booking: con la comisión, si viene)
        case when v_origen in ('B', 'D') then v_precio end,                   -- con comisión (Booking) o sin ella (directas)
        coalesce(v_origen, '') <> 'D' and not (v_origen = 'B' and v_comision is not null and v_precio is not null),
        v_recibido, v_personas)
      returning * into v_res;
      v_resultado := 'creada';
      if v_tipo = 'modificacion' then v_detalle := 'modificación de una reserva que no existía: se crea'; end if;

    else
      v_booking := coalesce(v_origen, v_res.origen_codigo) = 'B';
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
        importe_neto = case
          when v_booking and v_comision is not null and v_precio is not null then v_precio - v_comision
          -- Booking: si cambia el importe con comisión, el neto se recalcula al indicar la nueva comisión
          when v_booking then case when v_precio is not null and v_precio is distinct from importe then null else importe_neto end
          else coalesce(v_precio, importe_neto) end,
        comision_portal = case
          when v_booking and v_comision is not null and v_precio is not null then v_comision
          when v_booking and v_precio is not null and v_precio is distinct from importe then null
          else comision_portal end,
        importe = case
          when v_booking then coalesce(v_precio, importe)
          when coalesce(v_origen, origen_codigo) = 'D' then coalesce(v_precio, importe)
          -- histórico del Sheet con el neto apuntado como importe y sin comisión: el total no se conoce
          when comision_portal is null and importe = v_precio then null
          else importe end,
        importe_pendiente = case
          when coalesce(v_origen, origen_codigo) = 'D' then false
          when v_booking and v_comision is not null and v_precio is not null then false
          when v_booking then case
            when v_precio is not null and v_precio is distinct from importe then true   -- falta la comisión
            when importe_neto is null and comision_portal is null then true
            else importe_pendiente end
          when comision_portal is null and importe = v_precio then true
          when v_precio is not null
               and coalesce(importe_neto, importe - comision_portal) is distinct from v_precio then true
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
end $function$;
