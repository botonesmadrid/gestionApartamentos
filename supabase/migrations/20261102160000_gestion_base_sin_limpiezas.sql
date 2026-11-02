-- Aplicada en producción el 2026-11-02.
-- Gestión: nueva base de cálculo "Precio − comisión − limpiezas" (el % de Barco y Chueca se aplica sobre el precio
-- de las reservas menos la comisión del portal menos el 100 % del importe de las limpiezas del mes).

alter table public.reglas_gestion drop constraint if exists reglas_gestion_base_calculo_check;
alter table public.reglas_gestion add constraint reglas_gestion_base_calculo_check
  check (base_calculo in ('precio', 'precio_sin_comision', 'precio_sin_comision_ni_limpieza'));
update public.reglas_gestion rg set base_calculo = 'precio_sin_comision_ni_limpieza'
from public.clientes c where c.id = rg.cliente_id and c.codigo in ('BA', 'CH') and rg.tipo = 'porcentaje';

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
    select x.piso, coalesce(sum(x.importe), 0) as base
    from (
      select case when r.ambito = 'piso' then coalesce(v.piso, '—') else v_piso_cli end as piso,
             case when r.base_calculo = 'precio' then v.precio else v.precio_sin_comision end as importe
      from public.v_ingresos v
      where v.cliente_id = p_cliente and v.servicio = 'Checkin' and v.entrada >= m and v.entrada < (m + interval '1 month')
      union all
      -- "Precio − comisión − limpiezas": se resta el 100 % del importe de las limpiezas del mes.
      select case when r.ambito = 'piso' then coalesce(v.piso, '—') else v_piso_cli end,
             -coalesce(v.facturado_bruto, 0)
      from public.v_ingresos v
      where r.base_calculo = 'precio_sin_comision_ni_limpieza'
        and v.cliente_id = p_cliente and v.servicio = 'Limpieza' and v.entrada >= m and v.entrada < (m + interval '1 month')
    ) x
    group by 1
    union all
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
