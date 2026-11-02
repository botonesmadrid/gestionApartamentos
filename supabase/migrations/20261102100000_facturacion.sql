-- Aplicada en producción el 2026-11-02.
-- Facturación: facturas por periodo y cliente generadas desde Ingresos (réplica de las pestañas
-- "01 - Facturación CM - …", "04 - Facturación Barco"… del Sheet), con histórico y envío por email.
-- * configuracion_facturacion: datos del emisor, banco y plantilla del correo (una sola fila).
-- * clientes.emails_facturacion: destinatarios de las facturas del cliente.
-- * series_facturacion: cada factura mensual de un cliente (código 01, 02…, destinatario, qué servicios
--   incluye y cómo, IRPF/IVA). Nº de factura = AAMM + código de serie (p. ej. 261004).
-- * facturas / facturas_lineas: borrador → emitida (se anota en el libro de facturas como ingreso).

alter table public.clientes add column if not exists emails_facturacion text;

create table if not exists public.configuracion_facturacion (
  id int primary key default 1 check (id = 1),
  emisor_nombre text,
  emisor_nif text,
  emisor_direccion text,
  banco text,
  iban text,
  plantilla_asunto text,
  plantilla_cuerpo text,
  updated_at timestamptz not null default now()
);
alter table public.configuracion_facturacion enable row level security;
create policy "gestor acceso total configuracion_facturacion" on public.configuracion_facturacion
  for all using (public.es_gestor()) with check (public.es_gestor());
insert into public.configuracion_facturacion (id, emisor_nombre, emisor_nif, emisor_direccion, banco, iban, plantilla_asunto, plantilla_cuerpo)
values (1, 'El Botones · Raquel Albarracín García', '53661022K',
  'Calle Puerto de Navacerrada 16 - 3B, 28220 Majadahonda (Madrid)', 'Banco Santander', 'ES79 0049 0789 5521 1129 0336',
  'Factura {{numero}} · {{periodo}} · El Botones',
  E'Hola {{destinatario}},\n\nTe enviamos la factura {{numero}} correspondiente a {{periodo}}, por un importe total de {{total}}. Adjuntamos también el detalle de las reservas del periodo.\n\nUn saludo,\nEl Botones Madrid')
on conflict (id) do nothing;

create table if not exists public.series_facturacion (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  codigo text not null unique check (codigo ~ '^\d{2}$'),
  nombre text not null,
  destinatario_nombre text,
  destinatario_nif text,
  destinatario_direccion text,
  checkin text not null default 'no' check (checkin in ('no', 'agrupado', 'detalle')),
  limpieza text not null default 'no' check (limpieza in ('no', 'agrupado', 'detalle')),
  gestion boolean not null default false,
  servicios boolean not null default false,
  descontar_checkin boolean not null default false,   -- la gestión descuenta los check-in facturados aparte (CM)
  irpf_pct numeric not null default 0,
  iva_pct numeric not null default 21,
  concepto_libro text,                                -- concepto con el que se anota en el libro de facturas
  activa boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.series_facturacion enable row level security;
create policy "gestor acceso total series_facturacion" on public.series_facturacion
  for all using (public.es_gestor()) with check (public.es_gestor());

insert into public.series_facturacion (cliente_id, codigo, nombre, destinatario_nombre, destinatario_nif, destinatario_direccion,
  checkin, limpieza, gestion, servicios, descontar_checkin, irpf_pct, concepto_libro)
select c.id, s.codigo, s.nombre, s.dn, s.nif, s.dir, s.ci, s.li, s.ge, s.se, s.de, s.irpf, s.cl
from (values
  ('CM', '01', 'Casa Malasaña · Check-in', 'Antonio Mas Gómez', '50168265K', 'C/ Conde de la Cimera, 4, 2, 2, 28040 Madrid', 'agrupado', 'no', false, false, false, 15, 'Facturacion Antonio Check in'),
  ('CM', '02', 'Casa Malasaña · Gestión', 'Antonio Mas Gómez', '50168265K', 'C/ Conde de la Cimera, 4, 2, 2, 28040 Madrid', 'no', 'no', true, false, true, 15, 'Facturacion Antonio Gestion'),
  ('CM', '03', 'Casa Malasaña · Limpiezas', 'Casa Malasaña Consorcio', 'B87603221', 'C/ Acuerdo 3, 28015 Madrid', 'no', 'agrupado', false, false, false, 15, 'Facturacion Antonio Limpiezas'),
  ('BA', '04', 'Barco', 'Rodrigo Alfredo Jara Traub', 'Y9141358-E', 'Calle Barco 34, 1 Izquierda, 28004 Madrid', 'no', 'detalle', true, true, false, 0, 'Facturacion Barco'),
  ('CH', '05', 'Chueca', 'Maria Cecilia Magalhaes', 'Z0281008E', 'Bulevar Jardín de los Pájaros norte, 4654, Lo Barnechea, Santiago de Chile', 'no', 'detalle', true, true, false, 0, 'Facturacion Chueca')
) s(cod, codigo, nombre, dn, nif, dir, ci, li, ge, se, de, irpf, cl)
join public.clientes c on c.codigo = s.cod
on conflict (codigo) do nothing;

create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  serie_id uuid references public.series_facturacion(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  fecha date not null,
  periodo_desde date,
  periodo_hasta date,
  destinatario_nombre text,
  destinatario_nif text,
  destinatario_direccion text,
  irpf_pct numeric not null default 0,
  iva_pct numeric not null default 21,
  base numeric not null default 0,
  irpf numeric not null default 0,
  iva numeric not null default 0,
  total numeric not null default 0,
  estado text not null default 'borrador' check (estado in ('borrador', 'emitida', 'anulada')),
  origen text not null default 'app' check (origen in ('app', 'historico')),
  libro_id uuid,
  enviada_at timestamptz,
  enviada_a text,
  notas text,
  created_at timestamptz not null default now()
);
create unique index if not exists facturas_numero_app on public.facturas (numero) where origen = 'app';
create index if not exists facturas_fecha on public.facturas (fecha);
alter table public.facturas enable row level security;
create policy "gestor acceso total facturas" on public.facturas
  for all using (public.es_gestor()) with check (public.es_gestor());

create table if not exists public.facturas_lineas (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references public.facturas(id) on delete cascade,
  orden int not null default 0,
  concepto text not null,
  cantidad numeric not null default 1,
  precio numeric not null default 0,
  importe numeric generated always as (round(cantidad * precio, 2)) stored,
  ingreso_ids uuid[]
);
alter table public.facturas_lineas enable row level security;
create policy "gestor acceso total facturas_lineas" on public.facturas_lineas
  for all using (public.es_gestor()) with check (public.es_gestor());

-- Totales de la factura: base = suma de líneas; IRPF e IVA sobre la base; total = base − IRPF + IVA.
create or replace function public.facturas_recalcular(p_factura uuid)
returns void language sql security definer set search_path = '' as $$
  update public.facturas f set
    base = t.base,
    irpf = round(t.base * f.irpf_pct / 100, 2),
    iva = round(t.base * f.iva_pct / 100, 2),
    total = t.base - round(t.base * f.irpf_pct / 100, 2) + round(t.base * f.iva_pct / 100, 2)
  from (select coalesce(sum(importe), 0) base from public.facturas_lineas where factura_id = p_factura) t
  where f.id = p_factura and f.origen = 'app';
$$;
revoke execute on function public.facturas_recalcular(uuid) from public, anon, authenticated;

create or replace function public.facturas_lineas_cambio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.facturas_recalcular(coalesce(new.factura_id, old.factura_id));
  return null;
end $$;
revoke execute on function public.facturas_lineas_cambio() from public, anon, authenticated;
drop trigger if exists facturas_lineas_cambio on public.facturas_lineas;
create trigger facturas_lineas_cambio after insert or update or delete on public.facturas_lineas
  for each row execute function public.facturas_lineas_cambio();

create or replace function public.facturas_pct_cambio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.irpf_pct is distinct from old.irpf_pct or new.iva_pct is distinct from old.iva_pct then
    perform public.facturas_recalcular(new.id);
  end if;
  return null;
end $$;
revoke execute on function public.facturas_pct_cambio() from public, anon, authenticated;
drop trigger if exists facturas_pct_cambio on public.facturas;
create trigger facturas_pct_cambio after update of irpf_pct, iva_pct on public.facturas
  for each row execute function public.facturas_pct_cambio();

-- Genera (o rehace, si sigue en borrador) las facturas de un mes a partir de las líneas de Ingresos.
create or replace function public.generar_facturas(p_mes date, p_cliente uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  m date := date_trunc('month', p_mes)::date;
  fin date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_nombre text := (array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from p_mes)::int];
  s record; v_num text; v_id uuid; v_estado text; v_n int := 0; v_ord int; g record; v_checkin numeric;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  for s in select * from public.series_facturacion
           where activa and (p_cliente is null or cliente_id = p_cliente) order by codigo loop
    v_num := to_char(m, 'YYMM') || s.codigo;
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

    -- Gestión: las líneas de Gestión del mes (base, descuento del propietario, tramos…).
    if s.gestion then
      for g in select id, motivo, facturado_neto p from public.v_ingresos
               where cliente_id = s.cliente_id and servicio = 'Gestión' and entrada between m and fin
                 and coalesce(facturado_neto, 0) <> 0 order by created_at, motivo loop
        v_ord := v_ord + 1;
        insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
        values (v_id, v_ord, coalesce(g.motivo, 'Gestión ' || v_nombre), 1, g.p, array[g.id]);
      end loop;
      if s.descontar_checkin then
        select coalesce(sum(facturado_bruto), 0) into v_checkin from public.v_ingresos
        where cliente_id = s.cliente_id and servicio = 'Checkin' and entrada between m and fin;
        if v_checkin <> 0 then
          v_ord := v_ord + 1;
          insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio, ingreso_ids)
          values (v_id, v_ord, 'Check-in facturados aparte (' || v_nombre || ')', 1, -v_checkin, '{}');
        end if;
      end if;
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

-- Emitir: fija la factura y la anota como ingreso en el libro de facturas (Gastos · Facturas).
create or replace function public.emitir_factura(p_factura uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.facturas; s public.series_facturacion; v_libro uuid;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  select * into f from public.facturas where id = p_factura for update;
  if f.id is null or f.estado <> 'borrador' then raise exception 'La factura no está en borrador'; end if;
  select * into s from public.series_facturacion where id = f.serie_id;
  insert into public.libro_facturas (tipo, fecha, familia, concepto, valor_neto, irpf, iva, total, tipo_iva,
    numero_factura, empresa, cif, factura_id, origen)
  values ('I', f.fecha, 'Ingreso', coalesce(s.concepto_libro, 'Factura ' || f.numero), f.base, nullif(f.irpf, 0), f.iva,
    f.total, f.iva_pct / 100, f.numero, f.destinatario_nombre, f.destinatario_nif, f.id, 'manual')
  returning id into v_libro;
  update public.facturas set estado = 'emitida', libro_id = v_libro where id = p_factura;
end $$;
revoke execute on function public.emitir_factura(uuid) from public, anon;
grant execute on function public.emitir_factura(uuid) to authenticated;

-- Histórico: las facturas emitidas del libro (Sheet) se muestran como facturas históricas, sin líneas detalladas.
insert into public.facturas (numero, serie_id, cliente_id, fecha, periodo_desde, periodo_hasta, destinatario_nombre, destinatario_nif,
  irpf_pct, iva_pct, base, irpf, iva, total, estado, origen, libro_id)
select coalesce(l.numero_factura, 's/n'), s.id, s.cliente_id, l.fecha, date_trunc('month', l.fecha)::date, l.fecha,
  l.empresa, l.cif, 0, coalesce(l.tipo_iva, 0) * 100, coalesce(l.valor_neto, 0), coalesce(l.irpf, 0), coalesce(l.iva, 0),
  coalesce(l.total, 0), 'emitida', 'historico', l.id
from public.libro_facturas l
left join public.series_facturacion s on l.numero_factura ~ '^\d{6}$' and s.codigo = right(l.numero_factura, 2)
  and l.fecha >= date '2024-01-01'
where l.tipo = 'I' and l.origen = 'sheet'
  and not exists (select 1 from public.facturas f where f.libro_id = l.id);
insert into public.facturas_lineas (factura_id, orden, concepto, cantidad, precio)
select f.id, 1, coalesce(l.concepto, 'Factura'), 1, coalesce(l.valor_neto, 0)
from public.facturas f join public.libro_facturas l on l.id = f.libro_id
where f.origen = 'historico' and not exists (select 1 from public.facturas_lineas x where x.factura_id = f.id);
