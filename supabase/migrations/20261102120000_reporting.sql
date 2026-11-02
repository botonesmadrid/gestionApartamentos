-- Aplicada en producción el 2026-11-02.
-- Reporting: todas las estancias (reservas de la app + histórico del Sheet sin reserva enlazada) con el canal
-- agrupado como en el informe trimestral (Airbnb, Booking, Tripadvisor, Vrbo, Web propia, Spotahome/PlumGuide, Directo).
-- cuenta_ocupacion: el piso BAJO no cuenta para la ocupación (igual que en Ingresos).

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
join public.clientes c on c.id = b.cliente_id;
grant select on public.v_reporting_estancias to authenticated;
