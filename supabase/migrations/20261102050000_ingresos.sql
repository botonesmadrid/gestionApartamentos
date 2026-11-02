-- Aplicada en producción el 2026-11-02.
-- Módulo Ingresos: réplica de la pestaña "Ingresos" del Sheet de facturación.
-- Cada reserva de Entradas es una línea "Checkin" (sus datos no se vuelven a escribir);
-- el histórico importado del Sheet y las líneas manuales (p. ej. Limpieza) guardan sus propios datos.
-- Las columnas calculadas replican las fórmulas del Sheet en la vista v_ingresos.

alter table public.clientes add column if not exists pisos_ocupacion int not null default 1
  check (pisos_ocupacion > 0);                      -- divisor del % de ocupación (CM = 7)
update public.clientes set pisos_ocupacion = 7 where codigo = 'CM';

create table if not exists public.ingresos (
  id uuid primary key default gen_random_uuid(),
  numero text unique,                               -- CM-00124… (secuencial por cliente)
  cliente_id uuid not null references public.clientes(id),
  servicio text not null default 'Checkin',
  reserva_id uuid unique references public.reservas(id) on delete set null,
  -- Datos propios: solo para líneas sin reserva (histórico del Sheet o manuales).
  motivo text,
  documento text,
  codigo_reserva text,
  origen_codigo text,
  comision_portal numeric,
  precio numeric,
  fecha_reserva date,
  entrada date,
  salida date,
  fecha_pago date,
  forma_pago text,
  piso text,
  -- Ajustes manuales que prevalecen sobre la fórmula (como valores escritos a mano en el Sheet).
  facturado_bruto_manual numeric,
  pct_comision_manual numeric,
  -- Mano de obra (se introduce en Ingresos).
  horas_mo numeric,
  mo text,
  mo_si_no text check (mo_si_no in ('Si', 'No')),
  horario text,
  origen_datos text not null default 'manual',      -- 'reserva', 'sheet', 'manual'
  created_at timestamptz not null default now()
);
alter table public.ingresos enable row level security;
revoke all on public.ingresos from anon;
create policy "gestor acceso total ingresos" on public.ingresos
  for all using (public.es_gestor()) with check (public.es_gestor());

-- Numeración secuencial por cliente: <CODIGO>-<00000>.
create table if not exists public.contadores_ingresos (
  cliente_id uuid primary key references public.clientes(id),
  ultimo int not null default 0
);
alter table public.contadores_ingresos enable row level security;
revoke all on public.contadores_ingresos from anon;
create policy "gestor acceso total contadores_ingresos" on public.contadores_ingresos
  for all using (public.es_gestor()) with check (public.es_gestor());

create or replace function public.ingresos_numerar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_n int; v_cod text;
begin
  -- El histórico del Sheet conserva su ID (o ninguno) y no consume números de la secuencia.
  if new.numero is not null or new.origen_datos = 'sheet' then return new; end if;
  insert into public.contadores_ingresos (cliente_id, ultimo) values (new.cliente_id, 1)
  on conflict (cliente_id) do update set ultimo = public.contadores_ingresos.ultimo + 1
  returning ultimo into v_n;
  select codigo into v_cod from public.clientes where id = new.cliente_id;
  new.numero := coalesce(v_cod, 'XX') || '-' || lpad(v_n::text, 5, '0');
  return new;
end $$;
revoke execute on function public.ingresos_numerar() from public, anon, authenticated;
drop trigger if exists ingresos_numerar on public.ingresos;
create trigger ingresos_numerar before insert on public.ingresos
  for each row execute function public.ingresos_numerar();

-- Casa Malasaña continúa la numeración del Sheet (última: CM-00123).
insert into public.contadores_ingresos (cliente_id, ultimo)
select id, 123 from public.clientes where codigo = 'CM'
on conflict (cliente_id) do update set ultimo = greatest(public.contadores_ingresos.ultimo, 123);

-- Cada reserva nueva genera su línea Checkin.
create or replace function public.reservas_crear_ingreso()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cliente uuid;
begin
  select cliente_id into v_cliente from public.apartamentos where id = new.apartamento_id;
  if v_cliente is not null then
    insert into public.ingresos (cliente_id, servicio, reserva_id, origen_datos)
    values (v_cliente, 'Checkin', new.id, 'reserva')
    on conflict (reserva_id) do nothing;
  end if;
  return null;
end $$;
revoke execute on function public.reservas_crear_ingreso() from public, anon, authenticated;
drop trigger if exists reservas_crear_ingreso on public.reservas;
create trigger reservas_crear_ingreso after insert on public.reservas
  for each row execute function public.reservas_crear_ingreso();

-- Vista con las columnas calculadas (fórmulas del Sheet). security_invoker: respeta el RLS.
create or replace view public.v_ingresos with (security_invoker = true) as
with base as (
  select
    i.id, i.numero, i.servicio, i.reserva_id, i.origen_datos, i.created_at,
    c.id as cliente_id, c.codigo as cliente, c.pisos_ocupacion,
    case when r.id is not null
      then trim(concat_ws(' ', coalesce(t.nombre, r.nombre), coalesce(t.apellido1, r.apellido1), coalesce(t.apellido2, r.apellido2)))
      else i.motivo end as motivo,
    case when r.id is not null then t.numero_documento else i.documento end as documento,
    coalesce(r.codigo_reserva, i.codigo_reserva) as codigo_reserva,
    case when r.id is not null then r.origen_codigo else i.origen_codigo end as origen_codigo,
    case when r.id is not null then r.comision_portal else i.comision_portal end as comision_portal,
    case when r.id is not null then r.importe else i.precio end as precio,
    case when r.id is not null then r.fecha_reserva else i.fecha_reserva end as fecha_reserva,
    case when r.id is not null then r.fecha_entrada else i.entrada end as entrada,
    case when r.id is not null then r.fecha_salida else i.salida end as salida,
    case when r.id is not null then r.fecha_pago else i.fecha_pago end as fecha_pago,
    case when r.id is not null then coalesce(fp.descripcion, r.forma_pago) else i.forma_pago end as forma_pago,
    case when r.id is not null then a.piso else i.piso end as piso,
    i.horas_mo, i.mo, i.mo_si_no, i.horario, i.facturado_bruto_manual, i.pct_comision_manual,
    r.estado as estado_reserva
  from public.ingresos i
  join public.clientes c on c.id = i.cliente_id
  left join public.reservas r on r.id = i.reserva_id
  left join public.apartamentos a on a.id = r.apartamento_id
  left join public.formas_pago fp on fp.codigo = r.forma_pago_codigo
  left join lateral (
    select h.nombre, h.apellido1, h.apellido2, h.numero_documento
    from public.huespedes h
    where h.reserva_id = r.id
    order by (h.id = r.titular_huesped_id) desc, h.created_at
    limit 1
  ) t on true
  where r.id is null or r.estado <> 'cancelada'
),
calc as (
  select b.*,
    -- Precio sin comisión: =SI(ESBLANCO(I);"";I-H)
    case when b.precio is null then null else b.precio - coalesce(b.comision_portal, 0) end as precio_sin_comision,
    -- Facturado Botones bruto (ajuste manual o fórmula)
    coalesce(b.facturado_bruto_manual, case
      when b.cliente = 'CM' and b.servicio = 'Checkin' then 14
      when b.cliente in ('CR', 'BA', 'LA') and b.servicio = 'Limpieza' then 60
      when b.cliente = 'CM' and b.servicio = 'Limpieza' then 40
      when b.cliente = 'CH' and b.servicio = 'Limpieza' then 95
    end::numeric) as facturado_bruto,
    -- % comisión limpieza (ajuste manual o fórmula)
    coalesce(b.pct_comision_manual, case
      when b.cliente in ('BA', 'CH') and b.servicio = 'Limpieza' then 79
      when b.cliente = 'CM' and b.servicio = 'Limpieza' then 100
    end::numeric) as pct_comision_limpieza,
    -- Precio sin IVA: BA/LA/CH sin IVA; resto /1,1
    case when b.precio is null then null
         when b.cliente in ('BA', 'LA', 'CH') then b.precio
         else round(b.precio / 1.1, 2) end as precio_sin_iva,
    extract(year from b.entrada)::int as anio_e, extract(month from b.entrada)::int as mes_e, extract(day from b.entrada)::int as dia_e,
    extract(year from b.salida)::int as anio_s, extract(month from b.salida)::int as mes_s, extract(day from b.salida)::int as dia_s,
    -- Precio unitario MO (solo si hay horas)
    case when b.horas_mo is null then null when b.servicio = 'Limpieza' then 11.31 else 24.40 end as mo_unitario_bruto,
    case when b.horas_mo is null then null when b.servicio = 'Limpieza' then 8 else 17.22 end as mo_unitario_neto,
    -- Nº noches: Checkin y piso distinto de BAJO
    case when b.servicio = 'Checkin' and upper(coalesce(b.piso, '')) <> 'BAJO' and b.entrada is not null and b.salida is not null
         then b.salida - b.entrada end as noches
  from base b
)
select c.*,
  -- Facturado Botones neto: =Q*R/100 (vacío si no hay %)
  case when c.facturado_bruto is not null and c.pct_comision_limpieza is not null
       then c.facturado_bruto * c.pct_comision_limpieza / 100 else 0 end as facturado_neto,
  c.horas_mo * c.mo_unitario_bruto as coste_mo_bruto,
  c.horas_mo * c.mo_unitario_neto as coste_mo_neto,
  -- % ocupación: noches / pisos del cliente / días del mes de entrada × 100
  case when c.noches is null then null
       else round(c.noches::numeric / c.pisos_ocupacion
            / extract(day from (date_trunc('month', c.entrada) + interval '1 month - 1 day')) * 100, 3) end as pct_ocupacion
from calc c;

grant select on public.v_ingresos to authenticated;
