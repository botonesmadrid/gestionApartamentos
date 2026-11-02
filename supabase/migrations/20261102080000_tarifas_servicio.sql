-- Aplicada en producción el 2026-11-02.
-- Tarifas de Check-in y Limpieza por cliente, historizadas por fecha de vigencia (como las reglas de Gestión).
-- Cada línea nueva de Ingresos copia la tarifa vigente en su fecha de entrada; cambiar o añadir tarifas no
-- modifica las líneas ya creadas (siguen siendo editables una a una).
-- Las columnas antiguas de tarifas en clientes se conservan pero ya no se usan (salvo iva_pct y pct_comision_gestion).

create table if not exists public.tarifas_servicio (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  servicio text not null check (servicio in ('Checkin', 'Limpieza')),
  vigente_desde date not null,
  facturado_bruto numeric,       -- lo que factura Botones por servicio
  pct_comision numeric,          -- % del facturado que queda para Botones (vacío = sin neto)
  mo_bruto numeric,              -- precio hora mano de obra (bruto)
  mo_neto numeric,               -- precio hora mano de obra (neto)
  notas text,
  created_at timestamptz not null default now(),
  unique (cliente_id, servicio, vigente_desde)
);
alter table public.tarifas_servicio enable row level security;
create policy "gestor acceso total tarifas_servicio" on public.tarifas_servicio
  for all using (public.es_gestor()) with check (public.es_gestor());

-- Tarifas actuales de cada cliente como primera versión.
insert into public.tarifas_servicio (cliente_id, servicio, vigente_desde, facturado_bruto, pct_comision, mo_bruto, mo_neto)
select id, 'Checkin', date '2000-01-01', tarifa_checkin, null, mo_checkin_bruto, mo_checkin_neto from public.clientes
union all
select id, 'Limpieza', date '2000-01-01', tarifa_limpieza, pct_comision_limpieza, mo_limpieza_bruto, mo_limpieza_neto from public.clientes
on conflict do nothing;

-- Tarifas copiadas a la línea nueva: la versión vigente en la fecha de entrada de la línea.
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
    new.facturado_bruto := coalesce(new.facturado_bruto, t.facturado_bruto);
    new.pct_comision := coalesce(new.pct_comision, t.pct_comision);
    new.mo_unitario_bruto := coalesce(new.mo_unitario_bruto, t.mo_bruto);
    new.mo_unitario_neto := coalesce(new.mo_unitario_neto, t.mo_neto);
  else
    new.facturado_bruto := coalesce(new.facturado_bruto, case when new.servicio = 'Gestión' then c.tarifa_gestion end);
    new.pct_comision := coalesce(new.pct_comision, c.pct_comision_gestion);
  end if;
  return new;
end $$;
