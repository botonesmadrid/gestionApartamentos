-- PENDIENTE de aplicar en producción (a la espera de confirmación).
-- Reglas de facturación de Gestión por cliente, historizadas por fecha de vigencia.
-- * porcentaje: % sobre la facturación del mes (Barco, Chueca).
-- * tramos: cuota según el tramo de facturación alcanzado (Casa Malasaña). La línea base lleva la cuota
--   del primer tramo + el fijo adicional, y cada tramo superior alcanzado añade una línea "Extra" con la
--   diferencia respecto al anterior (igual que en el Sheet).
-- La facturación del mes es la suma de las líneas Checkin con entrada en ese mes.
-- Cálculo automático: el mes en curso se muestra como provisional (no se guarda) y, cerrado el mes,
-- un proceso diario lo consolida en líneas de Gestión con todas las entradas de ese mes.
-- Los meses que ya tienen líneas de Gestión importadas del Sheet no se recalculan (histórico intacto).

create table if not exists public.reglas_gestion (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  vigente_desde date not null,
  tipo text not null check (tipo in ('porcentaje', 'tramos')),
  porcentaje numeric,
  base_calculo text not null default 'precio_sin_comision' check (base_calculo in ('precio', 'precio_sin_comision')),
  fijo_adicional numeric not null default 0,  -- se suma a la línea base y se descuenta en una línea aparte (p. ej. lo que va al propietario)
  concepto_fijo text,                         -- nombre de esa línea de descuento (p. ej. "Antonio")
  ambito text not null default 'piso' check (ambito in ('piso', 'cliente')),  -- se calcula por apartamento o para todo el cliente
  notas text,
  created_at timestamptz not null default now(),
  unique (cliente_id, vigente_desde),
  check (tipo <> 'porcentaje' or porcentaje is not null)
);
create table if not exists public.reglas_gestion_tramos (
  id uuid primary key default gen_random_uuid(),
  regla_id uuid not null references public.reglas_gestion(id) on delete cascade,
  desde numeric not null default 0,   -- facturación mínima del tramo (el tramo llega hasta el "desde" del siguiente)
  importe numeric not null,           -- cuota total del mes si se alcanza este tramo
  unique (regla_id, desde)
);
alter table public.reglas_gestion enable row level security;
alter table public.reglas_gestion_tramos enable row level security;
revoke all on public.reglas_gestion, public.reglas_gestion_tramos from anon;
create policy "gestor acceso total reglas_gestion" on public.reglas_gestion
  for all using (public.es_gestor()) with check (public.es_gestor());
create policy "gestor acceso total reglas_gestion_tramos" on public.reglas_gestion_tramos
  for all using (public.es_gestor()) with check (public.es_gestor());

-- Reglas iniciales (tabla facilitada por el gestor).
do $$
declare v_cli uuid; v_r uuid; t record;
begin
  for t in select * from (values ('BA', date '2022-01-01', 21), ('BA', date '2026-04-01', 18),
                                 ('CH', date '2025-01-01', 21), ('CH', date '2026-04-01', 18)) x(cod, desde, pct) loop
    select id into v_cli from public.clientes where codigo = t.cod;
    if v_cli is not null then
      insert into public.reglas_gestion (cliente_id, vigente_desde, tipo, porcentaje, base_calculo, ambito)
      values (v_cli, t.desde, 'porcentaje', t.pct, 'precio_sin_comision', 'cliente') on conflict do nothing;
    end if;
  end loop;

  select id into v_cli from public.clientes where codigo = 'CM';
  if v_cli is null then return; end if;
  for t in select * from (values
      (date '2019-06-01', array[1200, 1450, 1730, 2040, 2380, 2750, 3150, 3150, 3150]::numeric[]),
      (date '2024-03-01', array[1300, 1562.5, 1857.5, 2182.5, 2539.5, 2929.5, 3349.5, 3769.5, 3769.5]::numeric[]),
      (date '2026-02-01', array[1361, 1631, 1935, 2269, 2636, 3037, 3469, 3901, 4333]::numeric[])) x(desde, importes) loop
    insert into public.reglas_gestion (cliente_id, vigente_desde, tipo, base_calculo, fijo_adicional, concepto_fijo, ambito)
    values (v_cli, t.desde, 'tramos', 'precio', 800, 'Antonio', 'cliente') on conflict do nothing returning id into v_r;
    if v_r is not null then
      insert into public.reglas_gestion_tramos (regla_id, desde, importe)
      select v_r, d, t.importes[i]
      from unnest(array[0, 15000, 18000, 22000, 25000, 28000, 31000, 38000, 44000]::numeric[]) with ordinality u(d, i);
    end if;
  end loop;
end $$;

-- Cálculo interno (sin guardar) de la gestión de un cliente para un mes: líneas por piso (o una sola
-- para todo el cliente si la regla es de ámbito cliente). No accesible desde la API.
create or replace function public._calcular_gestion(p_cliente uuid, p_mes date)
returns table (piso text, orden int, motivo text, importe numeric, facturacion numeric, regla_id uuid, regla_desde date)
language plpgsql stable security definer set search_path = '' as $$
declare
  m date := date_trunc('month', p_mes)::date;
  r public.reglas_gestion;
  v_nombre text := (array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from p_mes)::int];
  v_ord text[] := array['1er','2do','3er','4o','5o','6o','7o','8o','9o','10o','11o','12o'];
  g record; t record; v_prev numeric; v_n int; v_piso_cli text;
begin
  -- Ámbito cliente: la línea lleva el piso si el cliente tiene uno solo; si no, "Todos".
  select case when count(*) = 1 then max(a.piso) else 'Todos' end into v_piso_cli
  from public.apartamentos a where a.cliente_id = p_cliente and upper(a.piso) <> 'SIN ASIGNAR';
  select * into r from public.reglas_gestion rg
  where rg.cliente_id = p_cliente and rg.vigente_desde <= m order by rg.vigente_desde desc limit 1;
  if r.id is null then return; end if;

  -- Facturación del mes: líneas Checkin con entrada en el mes (reservas canceladas excluidas por la vista),
  -- agrupada por piso o para todo el cliente.
  for g in
    select case when r.ambito = 'piso' then coalesce(v.piso, '—') else v_piso_cli end as piso,
           coalesce(sum(case when r.base_calculo = 'precio' then v.precio else v.precio_sin_comision end), 0) as base
    from public.v_ingresos v
    where v.cliente_id = p_cliente and v.servicio = 'Checkin' and v.entrada >= m and v.entrada < (m + interval '1 month')
    group by 1
    union all
    -- ámbito cliente sin entradas en el mes: también se factura la cuota base
    select v_piso_cli, 0 where r.ambito = 'cliente' and not exists (
      select 1 from public.v_ingresos v where v.cliente_id = p_cliente and v.servicio = 'Checkin'
        and v.entrada >= m and v.entrada < (m + interval '1 month'))
    order by 1
  loop
    if r.tipo = 'porcentaje' then
      if g.base <> 0 then
        return query select g.piso, 0, 'Gestion ' || v_nombre, round(g.base * r.porcentaje / 100, 2), g.base, r.id, r.vigente_desde;
      end if;
      continue;
    end if;
    v_prev := null; v_n := 0;
    for t in select tr.desde, tr.importe from public.reglas_gestion_tramos tr where tr.regla_id = r.id order by tr.desde loop
      if v_prev is null then
        return query select g.piso, 0, v_nombre, t.importe + r.fijo_adicional, g.base, r.id, r.vigente_desde;
        if r.fijo_adicional <> 0 then
          return query select g.piso, 1, v_nombre || ' ' || coalesce(r.concepto_fijo, 'Fijo'), -r.fijo_adicional, g.base, r.id, r.vigente_desde;
        end if;
      elsif g.base >= t.desde and t.importe - v_prev <> 0 then
        v_n := v_n + 1;
        return query select g.piso, v_n + 1, v_nombre || ' Extra ' || coalesce(v_ord[v_n], v_n || 'o') || ' Tramo', t.importe - v_prev, g.base, r.id, r.vigente_desde;
      end if;
      v_prev := t.importe;
    end loop;
  end loop;
end $$;
revoke execute on function public._calcular_gestion(uuid, date) from public, anon, authenticated;

-- Importe provisional (o de cualquier mes) para la app: una fila por cliente con regla vigente.
create or replace function public.gestion_provisional(p_mes date)
returns table (cliente_id uuid, cliente text, piso text, orden int, motivo text, importe numeric, facturacion numeric, regla_desde date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  return query
  select c.id, c.codigo, g.piso, g.orden, g.motivo, g.importe, g.facturacion, g.regla_desde
  from public.clientes c cross join lateral public._calcular_gestion(c.id, p_mes) g
  order by c.codigo, g.piso, g.orden;
end $$;
revoke execute on function public.gestion_provisional(date) from public, anon;
grant execute on function public.gestion_provisional(date) to authenticated;

-- Consolida un mes cerrado en líneas de Gestión. Sin p_reemplazar, no toca clientes que ya tengan líneas
-- de Gestión de ese mes (importadas o consolidadas). Con p_reemplazar, rehace solo las consolidadas por regla.
create or replace function public._consolidar_gestion(p_mes date, p_cliente uuid default null, p_reemplazar boolean default false)
returns int language plpgsql security definer set search_path = '' as $$
declare m date := date_trunc('month', p_mes)::date; c record; v_total int := 0; v_n int;
begin
  if m >= date_trunc('month', current_date)::date then
    raise exception 'Solo se consolidan meses cerrados';
  end if;
  for c in select distinct g.cliente_id from public.reglas_gestion g
           where g.vigente_desde <= m and (p_cliente is null or g.cliente_id = p_cliente) loop
    if exists (select 1 from public.ingresos i where i.cliente_id = c.cliente_id and i.servicio = 'Gestión'
               and i.origen_datos = 'sheet' and i.entrada >= m and i.entrada < m + interval '1 month') then
      continue;  -- mes del histórico del Sheet: no se modifica
    end if;
    if exists (select 1 from public.ingresos i where i.cliente_id = c.cliente_id and i.servicio = 'Gestión'
               and i.origen_datos = 'regla' and i.entrada = m) then
      if not p_reemplazar then continue; end if;
      delete from public.ingresos i where i.cliente_id = c.cliente_id and i.servicio = 'Gestión'
        and i.origen_datos = 'regla' and i.entrada = m;
    end if;
    insert into public.ingresos (cliente_id, servicio, motivo, entrada, salida, piso, facturado_bruto, origen_datos)
    select c.cliente_id, 'Gestión', g.motivo, m, (m + interval '1 month - 1 day')::date, g.piso, g.importe, 'regla'
    from public._calcular_gestion(c.cliente_id, m) g order by g.piso, g.orden;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;
  return v_total;
end $$;
revoke execute on function public._consolidar_gestion(date, uuid, boolean) from public, anon, authenticated;

-- Recalcular a mano un mes cerrado desde la app (p. ej. si entró una reserva tarde).
create or replace function public.recalcular_gestion(p_mes date, p_cliente uuid)
returns int language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  return public._consolidar_gestion(p_mes, p_cliente, true);
end $$;
revoke execute on function public.recalcular_gestion(date, uuid) from public, anon;
grant execute on function public.recalcular_gestion(date, uuid) to authenticated;

-- Cierre automático: cada día se consolida el mes anterior (idempotente).
select cron.unschedule('consolidar-gestion') where exists (select 1 from cron.job where jobname = 'consolidar-gestion');
select cron.schedule('consolidar-gestion', '20 4 * * *',
  $$select public._consolidar_gestion((date_trunc('month', current_date) - interval '1 month')::date)$$);
