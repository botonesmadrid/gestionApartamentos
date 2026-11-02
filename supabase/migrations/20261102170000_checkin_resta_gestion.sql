-- Aplicada en producción el 2026-11-02.
-- Check-in facturado por separado (Casa Malasaña): opción del servicio Check-in del cliente que resta su importe
-- de la gestión. La gestión del mes lleva una línea "<Mes> Check-in facturado aparte" en negativo (así Ingresos y
-- Reporting no lo cuentan dos veces) y la factura de gestión lo resta de la línea base. Sustituye a la casilla
-- "descontar check-in" de las series de facturación.

alter table public.clientes add column if not exists checkin_resta_gestion boolean not null default false;
update public.clientes c set checkin_resta_gestion = true
where exists (select 1 from public.series_facturacion s where s.cliente_id = c.id and s.descontar_checkin);
update public.series_facturacion set descontar_checkin = false where descontar_checkin;

create or replace function public._calcular_gestion(p_cliente uuid, p_mes date)
returns table (piso text, orden int, motivo text, importe numeric, facturacion numeric, regla_id uuid, regla_desde date)
language plpgsql stable security definer set search_path = '' as $$
declare
  m date := date_trunc('month', p_mes)::date;
  r public.reglas_gestion;
  v_nombre text := (array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from p_mes)::int];
  v_ord text[] := array['1er','2do','3er','4o','5o','6o','7o','8o','9o','10o','11o','12o'];
  g record; t record; v_prev numeric; v_n int; v_piso_cli text; v_resta boolean; v_ci numeric;
begin
  -- Ámbito cliente: la línea lleva el piso si el cliente tiene uno solo; si no, "Todos".
  select case when count(*) = 1 then max(a.piso) else 'Todos' end into v_piso_cli
  from public.apartamentos a where a.cliente_id = p_cliente and upper(a.piso) <> 'SIN ASIGNAR';
  select * into r from public.reglas_gestion rg
  where rg.cliente_id = p_cliente and rg.vigente_desde <= m order by rg.vigente_desde desc limit 1;
  if r.id is null then return; end if;
  -- Check-in que se factura por separado: se resta de la gestión para no cobrarlo dos veces.
  select coalesce(cl.checkin_resta_gestion, false) into v_resta from public.clientes cl where cl.id = p_cliente;

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
    if v_resta then
      select coalesce(sum(v.facturado_bruto), 0) into v_ci from public.v_ingresos v
      where v.cliente_id = p_cliente and v.servicio = 'Checkin' and v.entrada >= m and v.entrada < (m + interval '1 month')
        and (r.ambito = 'cliente' or coalesce(v.piso, '—') = g.piso);
      if v_ci <> 0 then
        return query select g.piso, 1, v_nombre || ' Check-in facturado aparte', -v_ci, g.base, r.id, r.vigente_desde;
      end if;
    end if;
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

create or replace function public._rellenar_factura(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f public.facturas; s public.series_facturacion;
  m date; fin date; v_nombre text; v_ord int := 0; g record;
  v_checkin numeric; v_desc numeric; v_desc_ids uuid[]; v_primera boolean; v_pct numeric; v_concepto text;
  meses text[] := array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
begin
  select * into f from public.facturas where id = p_id;
  if f.id is null or f.estado <> 'borrador' then raise exception 'Solo se regeneran facturas en borrador'; end if;
  select * into s from public.series_facturacion where id = f.serie_id;
  m := f.periodo_desde; fin := f.periodo_hasta;
  v_nombre := case when date_trunc('month', m) = date_trunc('month', fin)
                   then meses[extract(month from m)::int]
                   else to_char(m, 'DD/MM/YYYY') || ' – ' || to_char(fin, 'DD/MM/YYYY') end;

  delete from public.facturas_lineas where factura_id = p_id and ingreso_ids is not null;

  -- Rectificativa por diferencias: primero se anulan las líneas de la factura original.
  if f.rectifica_id is not null then
    for g in select concepto, cantidad, precio from public.facturas_lineas where factura_id = f.rectifica_id order by orden loop
      v_ord := v_ord + 1;
      insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
      values (p_id, v_ord, 'Anula: ' || g.concepto, -g.cantidad, g.precio, '{}');
    end loop;
  end if;

  if s.id is not null and m is not null and fin is not null then
    if s.checkin = 'agrupado' then
      for g in select round(facturado_bruto / nullif(cantidad, 0), 2) p, sum(cantidad) c, array_agg(id) ids from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Checkin' and entrada between m and fin
                 and coalesce(facturado_bruto, 0) <> 0 group by 1 order by 1 loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (p_id, v_ord, 'El Botones Check in ' || v_nombre, g.c, g.p, g.ids);
      end loop;
    elsif s.checkin = 'detalle' then
      for g in select id, motivo, cantidad c, round(facturado_bruto / nullif(cantidad, 0), 2) p from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Checkin' and entrada between m and fin
                 and coalesce(facturado_bruto, 0) <> 0 order by entrada loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (p_id, v_ord, 'Check-in ' || coalesce(g.motivo, ''), g.c, g.p, array[g.id]);
      end loop;
    end if;

    if s.gestion then
      select coalesce(sum(facturado_neto), 0), coalesce(array_agg(id), '{}') into v_desc, v_desc_ids
      from public.v_ingresos
      where cliente_id = s.cliente_id and servicio = 'Gestión' and entrada between m and fin and facturado_neto < 0;
      -- Check-in facturado aparte: si la gestión del periodo no trae ya la línea que lo resta (meses del
      -- histórico), se descuenta aquí.
      if (select coalesce(checkin_resta_gestion, false) from public.clientes where id = s.cliente_id)
         and not exists (select 1 from public.v_ingresos where cliente_id = s.cliente_id and servicio = 'Gestión'
                         and entrada between m and fin and motivo ilike '%check-in facturado aparte%') then
        select coalesce(sum(facturado_bruto), 0) into v_checkin from public.v_ingresos
        where cliente_id = s.cliente_id and servicio = 'Checkin' and entrada between m and fin;
        v_desc := v_desc - v_checkin;
      end if;
      v_primera := true;
      for g in select id, motivo, facturado_neto p from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Gestión' and entrada between m and fin
                 and facturado_neto > 0 order by entrada, motivo, created_at loop
        v_ord := v_ord + 1;
        v_concepto := coalesce(g.motivo, 'Gestión ' || v_nombre);
        if v_primera then
          if s.plantilla_gestion is not null then
            select rg.porcentaje into v_pct from public.reglas_gestion rg
            where rg.cliente_id = s.cliente_id and rg.vigente_desde <= m and rg.tipo = 'porcentaje'
            order by rg.vigente_desde desc limit 1;
            if v_pct is not null and v_pct <> 0 then
              v_concepto := replace(replace(s.plantilla_gestion, '{{pct}}', replace(trim_scale(v_pct)::text, '.', ',')),
                '{{base}}', translate(to_char(round(g.p * 100 / v_pct, 2), 'FM999,999,990.00'), ',.', '.,'));
            end if;
          end if;
          insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
          values (p_id, v_ord, v_concepto, 1, g.p + v_desc, array[g.id] || v_desc_ids);
          v_primera := false;
        else
          insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
          values (p_id, v_ord, v_concepto, 1, g.p, array[g.id]);
        end if;
      end loop;
    end if;

    if s.limpieza = 'agrupado' then
      for g in select round(facturado_neto / nullif(cantidad, 0), 2) p, sum(cantidad) c, array_agg(id) ids from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Limpieza' and entrada between m and fin
                 and coalesce(facturado_neto, 0) <> 0 group by 1 order by 1 loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (p_id, v_ord, 'Limpiezas', g.c, g.p, g.ids);
      end loop;
    elsif s.limpieza = 'detalle' then
      for g in select id, motivo, cantidad c, round(facturado_neto / nullif(cantidad, 0), 2) p from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Limpieza' and entrada between m and fin
                 and coalesce(facturado_neto, 0) <> 0 order by entrada loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (p_id, v_ord, coalesce(g.motivo, 'Limpieza'), g.c, g.p, array[g.id]);
      end loop;
    end if;

    if s.servicios then
      for g in select id, motivo, cantidad c, round(facturado_neto / nullif(cantidad, 0), 2) p from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Servicios' and entrada between m and fin
                 and coalesce(facturado_neto, 0) <> 0 order by entrada loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (p_id, v_ord, coalesce(g.motivo, 'Servicio'), g.c, g.p, array[g.id]);
      end loop;
    end if;
  end if;

  perform public.facturas_recalcular(p_id);
end $$;
revoke execute on function public._rellenar_factura(uuid) from public, anon, authenticated;
