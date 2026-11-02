-- Aplicada en producción el 2026-11-02.
-- Facturas como las del Sheet:
-- * La gestión va en una línea base (p. ej. "Octubre 773 €") que ya resta las líneas negativas de Gestión
--   (lo que va al propietario) y, si la serie lo indica, los check-in facturados en otra serie; los tramos
--   siguen como líneas aparte.
-- * series_facturacion.plantilla_gestion: texto del concepto de gestión, con {{pct}} y {{base}} (facturación
--   sobre la que se aplica el %), p. ej. "El Botones Barco {{pct}}% facturacion {{base}}\nFacturacion (Sin comisiones portales)".

alter table public.series_facturacion add column if not exists plantilla_gestion text;
update public.series_facturacion set plantilla_gestion =
  E'El Botones Barco {{pct}}% facturacion {{base}}\nFacturacion (Sin comisiones portales ni limpiezas)'
where codigo = '04' and plantilla_gestion is null;
update public.series_facturacion set plantilla_gestion =
  E'El Botones Chueca {{pct}}% facturacion {{base}} €\nFacturacion (Sin comisiones portales)'
where codigo = '05' and plantilla_gestion is null;

create or replace function public.generar_facturas(p_mes date, p_cliente uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  m date := date_trunc('month', p_mes)::date;
  fin date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_nombre text := (array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from p_mes)::int];
  s record; v_num text; v_id uuid; v_estado text; v_n int := 0; v_ord int; g record;
  v_checkin numeric; v_desc numeric; v_desc_ids uuid[]; v_primera boolean; v_pct numeric; v_concepto text;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  for s in select * from public.series_facturacion
           where activa and (p_cliente is null or cliente_id = p_cliente) order by codigo loop
    v_num := to_char(m, 'YYMM') || s.codigo;
    v_id := null; v_estado := null;
    select id, estado into v_id, v_estado from public.facturas where numero = v_num and origen = 'app';
    if v_estado in ('emitida', 'anulada') then continue; end if;
    if v_id is null then
      insert into public.facturas (numero, serie_id, cliente_id, fecha, periodo_desde, periodo_hasta,
        destinatario_nombre, destinatario_nif, destinatario_direccion, irpf_pct, iva_pct)
      values (v_num, s.id, s.cliente_id, fin, m, fin, s.destinatario_nombre, s.destinatario_nif,
        s.destinatario_direccion, s.irpf_pct, s.iva_pct)
      returning id into v_id;
    else
      update public.facturas set fecha = fin, destinatario_nombre = s.destinatario_nombre,
        destinatario_nif = s.destinatario_nif, destinatario_direccion = s.destinatario_direccion,
        irpf_pct = s.irpf_pct, iva_pct = s.iva_pct where id = v_id;
      delete from public.facturas_lineas where factura_id = v_id and ingreso_ids is not null;
    end if;
    v_ord := 0;

    -- Check-in: agrupado por precio ("El Botones Check in Octubre": nº × tarifa) o una línea por reserva.
    if s.checkin = 'agrupado' then
      for g in select facturado_bruto p, count(*) c, array_agg(id) ids from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Checkin' and entrada between m and fin
                 and coalesce(facturado_bruto, 0) <> 0 group by 1 order by 1 loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (v_id, v_ord, 'El Botones Check in ' || v_nombre, g.c, g.p, g.ids);
      end loop;
    elsif s.checkin = 'detalle' then
      for g in select id, motivo, facturado_bruto p from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Checkin' and entrada between m and fin
                 and coalesce(facturado_bruto, 0) <> 0 order by entrada loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (v_id, v_ord, 'Check-in ' || coalesce(g.motivo, ''), 1, g.p, array[g.id]);
      end loop;
    end if;

    -- Gestión: línea base (restando negativos y, si procede, los check-in facturados aparte) + tramos.
    if s.gestion then
      select coalesce(sum(facturado_neto), 0), coalesce(array_agg(id), '{}') into v_desc, v_desc_ids
      from public.v_ingresos
      where cliente_id = s.cliente_id and servicio = 'Gestión' and entrada between m and fin and facturado_neto < 0;
      if s.descontar_checkin then
        select coalesce(sum(facturado_bruto), 0) into v_checkin from public.v_ingresos
        where cliente_id = s.cliente_id and servicio = 'Checkin' and entrada between m and fin;
        v_desc := v_desc - v_checkin;
      end if;
      v_primera := true;
      for g in select id, motivo, facturado_neto p from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Gestión' and entrada between m and fin
                 and facturado_neto > 0 order by motivo, created_at loop
        v_ord := v_ord + 1;
        v_concepto := coalesce(g.motivo, 'Gestión ' || v_nombre);
        if v_primera then
          -- Texto configurable con el % y la facturación sobre la que se aplica (regla vigente del mes).
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
          values (v_id, v_ord, v_concepto, 1, g.p + v_desc, array[g.id] || v_desc_ids);
          v_primera := false;
        else
          insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
          values (v_id, v_ord, v_concepto, 1, g.p, array[g.id]);
        end if;
      end loop;
    end if;

    -- Limpieza (importe neto para Botones): agrupada por precio o una línea por huésped.
    if s.limpieza = 'agrupado' then
      for g in select facturado_neto p, count(*) c, array_agg(id) ids from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Limpieza' and entrada between m and fin
                 and coalesce(facturado_neto, 0) <> 0 group by 1 order by 1 loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (v_id, v_ord, 'Limpiezas', g.c, g.p, g.ids);
      end loop;
    elsif s.limpieza = 'detalle' then
      for g in select id, motivo, facturado_neto p from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Limpieza' and entrada between m and fin
                 and coalesce(facturado_neto, 0) <> 0 order by entrada loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (v_id, v_ord, coalesce(g.motivo, 'Limpieza'), 1, g.p, array[g.id]);
      end loop;
    end if;

    -- Servicios (reparaciones, extras…).
    if s.servicios then
      for g in select id, motivo, facturado_neto p from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Servicios' and entrada between m and fin
                 and coalesce(facturado_neto, 0) <> 0 order by entrada loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (v_id, v_ord, coalesce(g.motivo, 'Servicio'), 1, g.p, array[g.id]);
      end loop;
    end if;

    perform public.facturas_recalcular(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.generar_facturas(date, uuid) from public, anon;
grant execute on function public.generar_facturas(date, uuid) to authenticated;
