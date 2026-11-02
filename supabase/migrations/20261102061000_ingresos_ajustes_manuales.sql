-- PENDIENTE de aplicar en producción (a la espera de confirmación).
-- Ajustes manuales por línea: valores escritos a mano en el Sheet (coste de MO sin horas,
-- facturado neto distinto de Q×R) que prevalecen sobre la fórmula. Se rellenan desde el Sheet.
alter table public.ingresos
  add column if not exists facturado_neto_manual numeric,
  add column if not exists coste_mo_bruto_manual numeric,
  add column if not exists coste_mo_neto_manual numeric;

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
  where r.id is null or r.estado <> 'cancelada'
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
            / extract(day from (date_trunc('month', b.entrada) + interval '1 month - 1 day')) * 100, 3) end as pct_ocupacion
from base b;
grant select on public.v_ingresos to authenticated;
