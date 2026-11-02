-- Aplicada en producción el 2026-11-02.
-- Limpiezas:
-- * ingresos.cantidad: nº de servicios de la línea (1 por defecto). Permite una línea mensual de Limpieza que agrupe
--   todas las del mes (p. ej. Casa Malasaña: 15 limpiezas); su importe por defecto es nº × tarifa vigente.
-- * Las facturas agrupan por precio unitario (importe / nº) sumando el nº de servicios.
-- * Tarifas nuevas: Barco Limpieza 95 € desde 01/11/2026; Casa Malasaña Limpieza 41,28 € desde 01/10/2026.
-- * Se crean las líneas de Limpieza de Barco y Chueca de reservas con check-in hecho desde octubre que no la tenían.

alter table public.ingresos add column if not exists cantidad numeric not null default 1 check (cantidad > 0);

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
            / extract(day from (date_trunc('month', b.entrada) + interval '1 month - 1 day')) * 100, 3) end as pct_ocupacion,
  (select i2.cantidad from public.ingresos i2 where i2.id = b.id) as cantidad
from base b;
grant select on public.v_ingresos to authenticated;


create or replace function public.ingresos_tarifas()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.clientes; t public.tarifas_servicio; v_fecha date;
begin
  select * into c from public.clientes where id = new.cliente_id;
  new.iva_pct := coalesce(new.iva_pct, c.iva_pct);
  if new.origen_datos = 'sheet' then return new; end if;

  if new.servicio in ('Checkin', 'Limpieza') then
    v_fecha := coalesce(new.entrada, (select r.fecha_entrada from public.reservas r where r.id = new.reserva_id), current_date);
    select * into t from public.tarifas_servicio ts
    where ts.cliente_id = new.cliente_id and ts.servicio = new.servicio and ts.vigente_desde <= v_fecha
    order by ts.vigente_desde desc limit 1;
    new.facturado_bruto := coalesce(new.facturado_bruto, t.facturado_bruto * coalesce(new.cantidad, 1));
    new.pct_comision := coalesce(new.pct_comision, t.pct_comision);
    new.mo_unitario_bruto := coalesce(new.mo_unitario_bruto, t.mo_bruto);
    new.mo_unitario_neto := coalesce(new.mo_unitario_neto, t.mo_neto);
  else
    new.facturado_bruto := coalesce(new.facturado_bruto, case when new.servicio = 'Gestión' then c.tarifa_gestion end);
    new.pct_comision := coalesce(new.pct_comision, c.pct_comision_gestion);
  end if;
  return new;
end $$;

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

insert into public.tarifas_servicio (cliente_id, servicio, vigente_desde, facturado_bruto, pct_comision, mo_bruto, mo_neto, notas)
select t.cliente_id, 'Limpieza', v.desde, v.importe, t.pct_comision, t.mo_bruto, t.mo_neto, 'Tarifa según las facturas de 2026'
from (values ('BA', date '2026-11-01', 95.00), ('CM', date '2026-10-01', 41.28)) v(cod, desde, importe)
join public.clientes c on c.codigo = v.cod
join lateral (select * from public.tarifas_servicio ts where ts.cliente_id = c.id and ts.servicio = 'Limpieza'
              order by ts.vigente_desde desc limit 1) t on true
on conflict do nothing;

insert into public.ingresos (cliente_id, servicio, reserva_id, origen_datos)
select a.cliente_id, 'Limpieza', r.id, 'reserva'
from public.reservas r
join public.apartamentos a on a.id = r.apartamento_id
join public.clientes c on c.id = a.cliente_id
where c.codigo in ('BA', 'CH') and r.estado <> 'cancelada' and r.checkin_at is not null and r.fecha_entrada >= date '2026-10-01'
  and not exists (select 1 from public.ingresos i where i.reserva_id = r.id and i.servicio = 'Limpieza')
order by r.fecha_entrada;
