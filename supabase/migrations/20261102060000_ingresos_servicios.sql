-- Aplicada en producción el 2026-11-02.
-- Ingresos por servicio: Check-in, Limpieza y Gestión (pestañas del módulo).
-- * Cada reserva genera sus líneas (Checkin y/o Limpieza, según el cliente) cuando se completa el check-in.
-- * La Limpieza de una reserva comparte el ID de su Check-in (igual que en el Sheet).
-- * Gestión/Servicios: líneas manuales, sin numeración.
-- * Tarifas por cliente: se copian a la línea al crearla; cambiarlas no afecta al histórico.

-- 1. Servicios que genera cada cliente y tarifas de Gestión.
alter table public.clientes
  add column if not exists genera_checkin boolean not null default true,
  add column if not exists genera_limpieza boolean not null default false,
  add column if not exists tarifa_gestion numeric,
  add column if not exists pct_comision_gestion numeric not null default 100;
update public.clientes set genera_limpieza = true where codigo in ('BA', 'CH');
update public.clientes set genera_checkin = false where codigo not in ('CM', 'BA', 'CH');

-- 2. Una línea por reserva y servicio; el ID se repite entre servicios de la misma reserva
--    (y el histórico del Sheet tiene repetidos, así que no se le exige unicidad).
alter table public.ingresos drop constraint if exists ingresos_numero_key;
alter table public.ingresos drop constraint if exists ingresos_reserva_id_key;
create unique index if not exists ingresos_reserva_servicio_key on public.ingresos (reserva_id, servicio);
create unique index if not exists ingresos_numero_servicio_key on public.ingresos (numero, servicio)
  where origen_datos <> 'sheet';
alter table public.ingresos drop constraint if exists ingresos_servicio_check;
alter table public.ingresos add constraint ingresos_servicio_check
  check (servicio in ('Checkin', 'Limpieza', 'Gestión', 'Servicios'));

-- 3. Numeración: Limpieza de una reserva reutiliza el ID de su Check-in; Gestión/Servicios no se numeran.
create or replace function public.ingresos_numerar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_n int; v_pref text;
begin
  if new.numero is not null or new.origen_datos = 'sheet' or new.servicio in ('Gestión', 'Servicios') then
    return new;
  end if;
  if new.reserva_id is not null then
    select numero into new.numero from public.ingresos
    where reserva_id = new.reserva_id and numero is not null
    order by (servicio = 'Checkin') desc limit 1;
    if new.numero is not null then return new; end if;
  end if;
  insert into public.contadores_ingresos (cliente_id, ultimo) values (new.cliente_id, 1)
  on conflict (cliente_id) do update set ultimo = public.contadores_ingresos.ultimo + 1
  returning ultimo into v_n;
  select coalesce(prefijo_ingresos, codigo) into v_pref from public.clientes where id = new.cliente_id;
  new.numero := coalesce(v_pref, 'XX') || '-' || lpad(v_n::text, 5, '0');
  return new;
end $$;

-- 4. Tarifas del cliente copiadas a la línea nueva (el histórico del Sheet conserva sus valores).
create or replace function public.ingresos_tarifas()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.clientes;
begin
  select * into c from public.clientes where id = new.cliente_id;
  new.iva_pct := coalesce(new.iva_pct, c.iva_pct);
  if new.origen_datos = 'sheet' then return new; end if;
  new.facturado_bruto := coalesce(new.facturado_bruto, case new.servicio
    when 'Checkin' then c.tarifa_checkin when 'Limpieza' then c.tarifa_limpieza when 'Gestión' then c.tarifa_gestion end);
  new.pct_comision := coalesce(new.pct_comision, case
    when new.servicio = 'Limpieza' then c.pct_comision_limpieza
    when new.servicio in ('Gestión', 'Servicios') then c.pct_comision_gestion end);
  new.mo_unitario_bruto := coalesce(new.mo_unitario_bruto, case new.servicio
    when 'Limpieza' then c.mo_limpieza_bruto when 'Checkin' then c.mo_checkin_bruto end);
  new.mo_unitario_neto := coalesce(new.mo_unitario_neto, case new.servicio
    when 'Limpieza' then c.mo_limpieza_neto when 'Checkin' then c.mo_checkin_neto end);
  return new;
end $$;

-- 5. La reserva genera sus líneas al darse por terminada (check-in completado).
create or replace function public.reservas_crear_ingreso()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.clientes;
begin
  if new.checkin_at is null or new.estado = 'cancelada'
     or (tg_op = 'UPDATE' and old.checkin_at is not null) then
    return null;
  end if;
  select cl.* into c from public.apartamentos a join public.clientes cl on cl.id = a.cliente_id
  where a.id = new.apartamento_id;
  if c.id is null then return null; end if;
  if c.genera_checkin then
    insert into public.ingresos (cliente_id, servicio, reserva_id, origen_datos)
    values (c.id, 'Checkin', new.id, 'reserva') on conflict (reserva_id, servicio) do nothing;
  end if;
  if c.genera_limpieza then
    insert into public.ingresos (cliente_id, servicio, reserva_id, origen_datos)
    values (c.id, 'Limpieza', new.id, 'reserva') on conflict (reserva_id, servicio) do nothing;
  end if;
  return null;
end $$;
revoke execute on function public.reservas_crear_ingreso() from public, anon, authenticated;
drop trigger if exists reservas_crear_ingreso on public.reservas;
create trigger reservas_crear_ingreso after insert or update of checkin_at on public.reservas
  for each row execute function public.reservas_crear_ingreso();

-- 6. Vista: pestaña de cada línea; en líneas que no son Checkin el precio/comisión no vienen de la reserva.
drop view if exists public.v_ingresos;
create view public.v_ingresos with (security_invoker = true) as
with base as (
  select
    i.id, i.numero, i.servicio,
    case i.servicio when 'Checkin' then 'checkin' when 'Limpieza' then 'limpieza' else 'gestion' end as pestana,
    i.reserva_id, i.origen_datos, i.created_at,
    c.id as cliente_id, c.codigo as cliente, c.pisos_ocupacion,
    case when r.id is not null
      then trim(concat_ws(' ', coalesce(t.nombre, r.nombre), coalesce(t.apellido1, r.apellido1), coalesce(t.apellido2, r.apellido2)))
      else i.motivo end as motivo,
    case when r.id is not null then t.numero_documento else i.documento end as documento,
    coalesce(r.codigo_reserva, i.codigo_reserva) as codigo_reserva,
    case when r.id is not null then r.origen_codigo else i.origen_codigo end as origen_codigo,
    case when r.id is not null and i.servicio = 'Checkin' then r.comision_portal else i.comision_portal end as comision_portal,
    case when r.id is not null and i.servicio = 'Checkin' then r.importe else i.precio end as precio,
    case when r.id is not null then r.fecha_reserva else i.fecha_reserva end as fecha_reserva,
    case when r.id is not null then r.fecha_entrada else i.entrada end as entrada,
    case when r.id is not null then r.fecha_salida else i.salida end as salida,
    case when r.id is not null then r.fecha_pago else i.fecha_pago end as fecha_pago,
    case when r.id is not null then coalesce(fp.descripcion, r.forma_pago) else i.forma_pago end as forma_pago,
    case when r.id is not null then a.piso else i.piso end as piso,
    i.horas_mo, i.mo, i.mo_si_no, i.horario,
    i.facturado_bruto, i.pct_comision as pct_comision_limpieza, i.iva_pct,
    i.mo_unitario_bruto, i.mo_unitario_neto
  from public.ingresos i
  join public.clientes c on c.id = i.cliente_id
  left join public.reservas r on r.id = i.reserva_id
  left join public.apartamentos a on a.id = r.apartamento_id
  left join public.formas_pago fp on fp.codigo = r.forma_pago_codigo
  left join lateral (
    select h.nombre, h.apellido1, h.apellido2, h.numero_documento
    from public.huespedes h where h.reserva_id = r.id
    order by (h.id = r.titular_huesped_id) desc, h.created_at limit 1
  ) t on true
  where r.id is null or r.estado <> 'cancelada'
)
select b.*,
  case when b.precio is null then null else b.precio - coalesce(b.comision_portal, 0) end as precio_sin_comision,
  case when b.precio is null then null else round(b.precio / (1 + coalesce(b.iva_pct, 0) / 100), 2) end as precio_sin_iva,
  case when b.facturado_bruto is not null and b.pct_comision_limpieza is not null
       then b.facturado_bruto * b.pct_comision_limpieza / 100 else 0 end as facturado_neto,
  extract(year from b.entrada)::int as anio_e, extract(month from b.entrada)::int as mes_e, extract(day from b.entrada)::int as dia_e,
  extract(year from b.salida)::int as anio_s, extract(month from b.salida)::int as mes_s, extract(day from b.salida)::int as dia_s,
  b.horas_mo * b.mo_unitario_bruto as coste_mo_bruto,
  b.horas_mo * b.mo_unitario_neto as coste_mo_neto,
  case when b.servicio = 'Checkin' and upper(coalesce(b.piso, '')) <> 'BAJO' and b.entrada is not null and b.salida is not null
       then b.salida - b.entrada end as noches,
  case when b.servicio = 'Checkin' and upper(coalesce(b.piso, '')) <> 'BAJO' and b.entrada is not null and b.salida is not null
       then round((b.salida - b.entrada)::numeric / b.pisos_ocupacion
            / extract(day from (date_trunc('month', b.entrada) + interval '1 month - 1 day')) * 100, 3) end as pct_ocupacion
from base b;
grant select on public.v_ingresos to authenticated;
