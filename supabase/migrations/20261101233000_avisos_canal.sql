-- Reservas alimentadas por los avisos por correo de los channel managers (Avirato primero).

-- 1. Apartamentos: nombre con el que el channel manager identifica cada piso.
alter table public.apartamentos add column if not exists nombre_en_canal text unique;
update public.apartamentos set nombre_en_canal = 'El Botones Barco' where piso = '1ª Izq';
update public.apartamentos set nombre_en_canal = 'El Botones -Nuevo apto temporal en Plaza de Chueca' where piso = '1º Dcha';

-- 2. Reservas: canal, estado, importe neto y acción pendiente.
alter table public.reservas
  add column if not exists canal text,                    -- 'sheet', 'avirato', 'manual'…
  add column if not exists estado text not null default 'confirmada'
    check (estado in ('confirmada', 'cancelada')),
  add column if not exists importe_neto numeric,          -- lo que liquida el portal (con IVA, sin comisión)
  add column if not exists importe_pendiente boolean not null default false,
  add column if not exists cancelada_at timestamptz,
  add column if not exists actualizada_at timestamptz;
update public.reservas set canal = 'sheet' where canal is null;
create index if not exists reservas_codigo_reserva_idx on public.reservas (codigo_reserva);
create index if not exists reservas_pendientes_idx on public.reservas (importe_pendiente) where importe_pendiente;

-- importe = total con comisión. Si conocemos el neto, la comisión se calcula sola.
create or replace function public.reservas_calcular_comision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.importe is not null and new.importe_neto is not null then
    new.comision_portal := new.importe - new.importe_neto;
  end if;
  new.actualizada_at := now();
  return new;
end $$;
drop trigger if exists reservas_calcular_comision on public.reservas;
create trigger reservas_calcular_comision before insert or update on public.reservas
  for each row execute function public.reservas_calcular_comision();
revoke execute on function public.reservas_calcular_comision() from public, anon, authenticated;

-- 3. Registro de cada correo recibido y cómo se procesó.
create table if not exists public.avisos_canal (
  id uuid primary key default gen_random_uuid(),
  canal text not null,                        -- 'avirato'
  mensaje_id text not null unique,            -- id del mensaje en Gmail: evita procesarlo dos veces
  recibido_at timestamptz,
  asunto text,
  cuerpo text,                                -- texto original, para revisar o reprocesar
  datos jsonb,                                -- lo que se leyó del correo
  resultado text not null default 'pendiente'
    check (resultado in ('pendiente', 'creada', 'actualizada', 'cancelada', 'revisar')),
  detalle text,
  reserva_id uuid references public.reservas(id) on delete set null,
  procesado_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.avisos_canal enable row level security;
revoke all on public.avisos_canal from anon;
create policy "gestor acceso total avisos_canal" on public.avisos_canal
  for all using (public.es_gestor()) with check (public.es_gestor());

-- 4. Aplica un aviso ya leído a la tabla de reservas.
--    p: {canal, mensaje_id, recibido_at, asunto, cuerpo, tipo: alta|modificacion|cancelacion,
--        portal, codigo, cliente, habitacion, entrada, salida, telefono, precio_total, ...}
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

    if v_tipo = 'cancelacion' then
      if v_res.id is null then
        insert into public.reservas (apartamento_id, fecha_reserva, fecha_entrada, fecha_salida, nombre,
          codigo_reserva, origen_codigo, origen_reserva, telefono, canal, estado, cancelada_at)
        values (v_apto, (p->>'recibido_at')::date, v_entrada, v_salida, coalesce(p->>'cliente', '(sin nombre)'),
          p->>'codigo', v_origen, p->>'portal', nullif(p->>'telefono',''), p->>'canal', 'cancelada', now())
        returning * into v_res;
        v_detalle := 'cancelación de una reserva que no existía: se registra como cancelada';
      else
        update public.reservas set estado = 'cancelada', cancelada_at = now(), importe_pendiente = false,
          codigo_reserva = coalesce(p->>'codigo', codigo_reserva)
        where id = v_res.id returning * into v_res;
      end if;
      v_resultado := 'cancelada';

    elsif v_res.id is null then
      insert into public.reservas (apartamento_id, fecha_reserva, fecha_entrada, fecha_salida, nombre,
        codigo_reserva, origen_codigo, origen_reserva, telefono, canal, estado,
        importe_neto, importe, importe_pendiente)
      values (v_apto, (p->>'recibido_at')::date, v_entrada, v_salida, coalesce(p->>'cliente', '(sin nombre)'),
        p->>'codigo', v_origen, p->>'portal', nullif(p->>'telefono',''), p->>'canal', 'confirmada',
        v_neto,
        case when v_origen = 'D' then v_neto end,           -- directas: sin comisión
        coalesce(v_origen, '') <> 'D')
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
        importe_neto = coalesce(v_neto, importe_neto),
        -- si el neto cambia, hay que revisar el importe con comisión (salvo directas)
        importe = case when coalesce(v_origen, origen_codigo) = 'D' then coalesce(v_neto, importe) else importe end,
        importe_pendiente = case
          when coalesce(v_origen, origen_codigo) = 'D' then false
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

-- La Edge Function (service_role) es la única que llama a registrar_aviso_canal.
grant execute on function public.registrar_aviso_canal(jsonb) to service_role;
