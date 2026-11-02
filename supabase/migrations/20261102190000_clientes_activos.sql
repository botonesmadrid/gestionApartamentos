-- Aplicada en producción el 2026-11-02.
-- Clientes activos/inactivos: un cliente inactivo deja de verse en Ingresos, Reporting, Gestión provisional,
-- Facturación y en los selectores de cliente (solo en Maestros, desde donde se reactiva). El libro de facturas
-- (Gastos) y el IVA no se filtran: son la contabilidad de Botones.

alter table public.clientes add column if not exists activo boolean not null default true;
update public.clientes set activo = false where codigo in ('LA', 'ES', 'CR');

-- Facturas históricas enlazadas a su cliente por el destinatario (para poder ocultarlas).
update public.facturas f set cliente_id = c.id
from public.clientes c
where f.cliente_id is null and f.origen = 'historico'
  and ((c.codigo = 'LA' and f.destinatario_nombre ilike 'Mario Bonaut%')
    or (c.codigo = 'CR' and f.destinatario_nombre ilike 'Gemespa%'));

create or replace view public.v_ingresos with (security_invoker = true) as
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
    i.mo_unitario_bruto, i.mo_unitario_neto,
    i.facturado_neto_manual, i.coste_mo_bruto_manual, i.coste_mo_neto_manual
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
  where (r.id is null or r.estado <> 'cancelada') and c.activo
)
select b.*,
  case when b.precio is null then null else b.precio - coalesce(b.comision_portal, 0) end as precio_sin_comision,
  case when b.precio is null then null else round(b.precio / (1 + coalesce(b.iva_pct, 0) / 100), 2) end as precio_sin_iva,
  coalesce(b.facturado_neto_manual, case when b.facturado_bruto is not null and b.pct_comision_limpieza is not null
       then b.facturado_bruto * b.pct_comision_limpieza / 100 else 0 end) as facturado_neto,
  extract(year from b.entrada)::int as anio_e, extract(month from b.entrada)::int as mes_e, extract(day from b.entrada)::int as dia_e,
  extract(year from b.salida)::int as anio_s, extract(month from b.salida)::int as mes_s, extract(day from b.salida)::int as dia_s,
  coalesce(b.coste_mo_bruto_manual, b.horas_mo * b.mo_unitario_bruto) as coste_mo_bruto,
  coalesce(b.coste_mo_neto_manual, b.horas_mo * b.mo_unitario_neto) as coste_mo_neto,
  case when b.servicio = 'Checkin' and upper(coalesce(b.piso, '')) <> 'BAJO' and b.entrada is not null and b.salida is not null
       then b.salida - b.entrada end as noches,
  case when b.servicio = 'Checkin' and upper(coalesce(b.piso, '')) <> 'BAJO' and b.entrada is not null and b.salida is not null
       then round((b.salida - b.entrada)::numeric / b.pisos_ocupacion
            / extract(day from (date_trunc('month', b.entrada) + interval '1 month - 1 day')) * 100, 3) end as pct_ocupacion,
  (select i2.cantidad from public.ingresos i2 where i2.id = b.id) as cantidad
from base b;
grant select on public.v_ingresos to authenticated;

create or replace view public.v_reporting_estancias with (security_invoker = true) as
with base as (
  select 'reserva'::text as fuente, a.cliente_id, a.piso, r.fecha_entrada as entrada, r.fecha_salida as salida,
         r.importe as precio, r.comision_portal, r.origen_codigo, r.fecha_reserva
  from public.reservas r
  join public.apartamentos a on a.id = r.apartamento_id
  where r.estado <> 'cancelada' and a.cliente_id is not null
  union all
  select 'historico', i.cliente_id, i.piso, i.entrada, i.salida, i.precio, i.comision_portal, i.origen_codigo, i.fecha_reserva
  from public.ingresos i
  where i.servicio = 'Checkin' and i.reserva_id is null and i.entrada is not null
)
select b.*, c.codigo as cliente, c.pisos_ocupacion,
  greatest(coalesce(b.salida - b.entrada, 0), 0) as noches,
  upper(coalesce(b.piso, '')) not in ('BAJO') as cuenta_ocupacion,
  case upper(coalesce(b.origen_codigo, ''))
    when 'A' then 'Airbnb' when 'B' then 'Booking' when 'T' then 'Tripadvisor' when 'V' then 'Vrbo'
    when 'W' then 'Web propia' when 'S' then 'Spotahome/PlumGuide' when 'P' then 'Spotahome/PlumGuide'
    when 'D' then 'Directo' else 'Otros' end as canal,
  extract(year from b.entrada)::int as anio, extract(month from b.entrada)::int as mes
from base b
join public.clientes c on c.id = b.cliente_id
where c.activo;
grant select on public.v_reporting_estancias to authenticated;

create or replace function public.gestion_provisional(p_mes date)
returns table (cliente_id uuid, cliente text, piso text, orden int, motivo text, importe numeric, facturacion numeric, regla_desde date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  return query
  select c.id, c.codigo, g.piso, g.orden, g.motivo, g.importe, g.facturacion, g.regla_desde
  from public.clientes c cross join lateral public._calcular_gestion(c.id, p_mes) g
  where c.activo
  order by c.codigo, g.piso, g.orden;
end $$;
revoke execute on function public.gestion_provisional(date) from public, anon;
grant execute on function public.gestion_provisional(date) to authenticated;
