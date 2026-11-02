-- Aplicada en producción el 2026-11-02.
-- Facturas por cliente y periodo (desde–hasta), regenerables mientras no se envían; al enviarse quedan fijas
-- (emitidas) y solo se corrigen con una factura rectificativa por diferencias:
--   líneas de la original en negativo ("Anula: …") + líneas recalculadas con los datos actuales.

alter table public.facturas
  add column if not exists tipo text not null default 'ordinaria',
  add column if not exists rectifica_id uuid references public.facturas(id),
  add column if not exists motivo_rectificacion text;
alter table public.facturas drop constraint if exists facturas_tipo_check;
alter table public.facturas add constraint facturas_tipo_check check (tipo in ('ordinaria', 'rectificativa'));

-- Rellena (o rehace) las líneas automáticas de una factura en borrador. Las líneas manuales se conservan.
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
      for g in select facturado_bruto p, count(*) c, array_agg(id) ids from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Checkin' and entrada between m and fin
                 and coalesce(facturado_bruto, 0) <> 0 group by 1 order by 1 loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (p_id, v_ord, 'El Botones Check in ' || v_nombre, g.c, g.p, g.ids);
      end loop;
    elsif s.checkin = 'detalle' then
      for g in select id, motivo, facturado_bruto p from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Checkin' and entrada between m and fin
                 and coalesce(facturado_bruto, 0) <> 0 order by entrada loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (p_id, v_ord, 'Check-in ' || coalesce(g.motivo, ''), 1, g.p, array[g.id]);
      end loop;
    end if;

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
      for g in select facturado_neto p, count(*) c, array_agg(id) ids from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Limpieza' and entrada between m and fin
                 and coalesce(facturado_neto, 0) <> 0 group by 1 order by 1 loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (p_id, v_ord, 'Limpiezas', g.c, g.p, g.ids);
      end loop;
    elsif s.limpieza = 'detalle' then
      for g in select id, motivo, facturado_neto p from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Limpieza' and entrada between m and fin
                 and coalesce(facturado_neto, 0) <> 0 order by entrada loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (p_id, v_ord, coalesce(g.motivo, 'Limpieza'), 1, g.p, array[g.id]);
      end loop;
    end if;

    if s.servicios then
      for g in select id, motivo, facturado_neto p from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Servicios' and entrada between m and fin
                 and coalesce(facturado_neto, 0) <> 0 order by entrada loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (p_id, v_ord, coalesce(g.motivo, 'Servicio'), 1, g.p, array[g.id]);
      end loop;
    end if;
  end if;

  perform public.facturas_recalcular(p_id);
end $$;
revoke execute on function public._rellenar_factura(uuid) from public, anon, authenticated;

-- Número libre: base y, si ya existe, base-2, base-3…
create or replace function public._numero_factura_libre(p_base text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v text := p_base; n int := 1;
begin
  while exists (select 1 from public.facturas where numero = v and origen = 'app') loop
    n := n + 1; v := p_base || '-' || n;
  end loop;
  return v;
end $$;
revoke execute on function public._numero_factura_libre(text) from public, anon, authenticated;

-- Genera (o vuelve a generar, si no se han enviado) las facturas de un cliente para un periodo.
create or replace function public.generar_facturas_periodo(p_cliente uuid, p_desde date, p_hasta date)
returns int language plpgsql security definer set search_path = '' as $$
declare s record; v_id uuid; v_estado text; v_n int := 0;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  if p_cliente is null or p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Indica el cliente y un periodo válido';
  end if;
  for s in select * from public.series_facturacion where activa and cliente_id = p_cliente order by codigo loop
    v_id := null; v_estado := null;
    select id, estado into v_id, v_estado from public.facturas
    where serie_id = s.id and origen = 'app' and tipo = 'ordinaria' and periodo_desde = p_desde and periodo_hasta = p_hasta
    order by created_at desc limit 1;
    if v_estado is not null and v_estado <> 'borrador' then continue; end if; -- enviada: fija
    if v_id is null then
      insert into public.facturas (numero, serie_id, cliente_id, fecha, periodo_desde, periodo_hasta,
        destinatario_nombre, destinatario_nif, destinatario_direccion, irpf_pct, iva_pct)
      values (public._numero_factura_libre(to_char(p_hasta, 'YYMM') || s.codigo), s.id, s.cliente_id, p_hasta, p_desde, p_hasta,
        s.destinatario_nombre, s.destinatario_nif, s.destinatario_direccion, s.irpf_pct, s.iva_pct)
      returning id into v_id;
    else
      update public.facturas set destinatario_nombre = s.destinatario_nombre, destinatario_nif = s.destinatario_nif,
        destinatario_direccion = s.destinatario_direccion, irpf_pct = s.irpf_pct, iva_pct = s.iva_pct where id = v_id;
    end if;
    perform public._rellenar_factura(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.generar_facturas_periodo(uuid, date, date) from public, anon;
grant execute on function public.generar_facturas_periodo(uuid, date, date) to authenticated;

-- Volver a generar una factura en borrador (datos actuales de Ingresos y de la serie).
create or replace function public.regenerar_factura(p_factura uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.facturas; s public.series_facturacion;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  select * into f from public.facturas where id = p_factura;
  if f.id is null or f.estado <> 'borrador' or f.origen <> 'app' then raise exception 'Solo se regeneran facturas sin enviar'; end if;
  select * into s from public.series_facturacion where id = f.serie_id;
  if s.id is not null and f.tipo = 'ordinaria' then
    update public.facturas set destinatario_nombre = s.destinatario_nombre, destinatario_nif = s.destinatario_nif,
      destinatario_direccion = s.destinatario_direccion, irpf_pct = s.irpf_pct, iva_pct = s.iva_pct where id = f.id;
  end if;
  perform public._rellenar_factura(f.id);
end $$;
revoke execute on function public.regenerar_factura(uuid) from public, anon;
grant execute on function public.regenerar_factura(uuid) to authenticated;

-- Rectificativa por diferencias de una factura ya enviada/emitida. Queda en borrador para revisarla y enviarla.
-- Los conceptos añadidos a mano en la original se copian como manuales (editables) para que, si no cambian,
-- la diferencia sea cero. En facturas históricas (sin serie) se copian todas sus líneas.
create or replace function public.crear_rectificativa(p_factura uuid, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare f public.facturas; v_id uuid;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  select * into f from public.facturas where id = p_factura;
  if f.id is null or f.estado <> 'emitida' then raise exception 'Solo se rectifican facturas enviadas'; end if;
  insert into public.facturas (numero, tipo, rectifica_id, motivo_rectificacion, serie_id, cliente_id, fecha, periodo_desde, periodo_hasta,
    destinatario_nombre, destinatario_nif, destinatario_direccion, irpf_pct, iva_pct, origen)
  values (public._numero_factura_libre('R' || f.numero), 'rectificativa', f.id, nullif(trim(p_motivo), ''), f.serie_id, f.cliente_id,
    current_date, f.periodo_desde, f.periodo_hasta, f.destinatario_nombre, f.destinatario_nif, f.destinatario_direccion,
    f.irpf_pct, f.iva_pct, 'app')
  returning id into v_id;
  insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
  select v_id, 1000 + orden, concepto, cantidad, precio, null
  from public.facturas_lineas
  where factura_id = f.id and (ingreso_ids is null or f.serie_id is null);
  perform public._rellenar_factura(v_id);
  return v_id;
end $$;
revoke execute on function public.crear_rectificativa(uuid, text) from public, anon;
grant execute on function public.crear_rectificativa(uuid, text) to authenticated;

-- Emitir (al enviar o al fijarla sin enviar): queda fija y se anota en el libro de facturas.
create or replace function public.emitir_factura(p_factura uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.facturas; s public.series_facturacion; o public.facturas; v_libro uuid; v_concepto text;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  select * into f from public.facturas where id = p_factura for update;
  if f.id is null or f.estado <> 'borrador' then raise exception 'La factura ya está emitida'; end if;
  select * into s from public.series_facturacion where id = f.serie_id;
  v_concepto := coalesce(s.concepto_libro, 'Factura ' || f.numero);
  if f.tipo = 'rectificativa' then
    select * into o from public.facturas where id = f.rectifica_id;
    v_concepto := 'Rectificativa de ' || coalesce(o.numero, '') || ' · ' || v_concepto;
  end if;
  insert into public.libro_facturas (tipo, fecha, familia, concepto, comentarios, valor_neto, irpf, iva, total, tipo_iva,
    numero_factura, empresa, cif, factura_id, origen)
  values ('I', f.fecha, 'Ingreso', v_concepto, f.motivo_rectificacion, f.base, nullif(f.irpf, 0), f.iva,
    f.total, f.iva_pct / 100, f.numero, f.destinatario_nombre, f.destinatario_nif, f.id, 'manual')
  returning id into v_libro;
  update public.facturas set estado = 'emitida', libro_id = v_libro where id = p_factura;
end $$;
revoke execute on function public.emitir_factura(uuid) from public, anon;
grant execute on function public.emitir_factura(uuid) to authenticated;
