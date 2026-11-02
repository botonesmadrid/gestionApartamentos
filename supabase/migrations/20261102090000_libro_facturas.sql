-- Aplicada en producción el 2026-11-02.
-- Gastos · Facturas: libro de facturas recibidas (G) y emitidas (I), réplica de la pestaña "Facturas"
-- del Sheet de Facturación. IVA y total se calculan en la app (neto × tipo IVA; neto − IRPF + IVA + suplido)
-- pero se guardan, y se pueden ajustar a mano como en el Sheet.
-- v_iva_trimestral replica la pestaña "IVA Trimestral Resumen" (IVA a pagar = IVA ingresos − IVA gastos).

create table if not exists public.libro_facturas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('I', 'G')),          -- I = ingreso (factura emitida), G = gasto
  fecha date not null,
  familia text,
  concepto text,
  comentarios text,
  valor_neto numeric,
  irpf numeric,
  iva numeric,
  suplido numeric,
  total numeric,
  tipo_iva numeric,                                        -- 0.21, 0.10…
  numero_factura text,
  empresa text,
  cif text,
  anio int generated always as (extract(year from fecha)::int) stored,
  mes int generated always as (extract(month from fecha)::int) stored,
  trimestre int generated always as (((extract(month from fecha)::int - 1) / 3) + 1) stored,
  factura_id uuid,                                         -- factura emitida desde la app (Facturación)
  origen text not null default 'manual',                   -- 'sheet' o 'manual'
  fila_sheet int,
  created_at timestamptz not null default now()
);
create index if not exists libro_facturas_fecha on public.libro_facturas (fecha);
alter table public.libro_facturas enable row level security;
create policy "gestor acceso total libro_facturas" on public.libro_facturas
  for all using (public.es_gestor()) with check (public.es_gestor());

create or replace view public.v_iva_trimestral with (security_invoker = true) as
select anio, trimestre,
  count(*) filter (where tipo = 'I') as facturas_emitidas,
  coalesce(sum(valor_neto) filter (where tipo = 'I'), 0) as base_ingresos,
  coalesce(sum(iva) filter (where tipo = 'I'), 0) as iva_repercutido,
  coalesce(sum(irpf) filter (where tipo = 'I'), 0) as irpf_ingresos,
  coalesce(sum(total) filter (where tipo = 'I'), 0) as total_ingresos,
  count(*) filter (where tipo = 'G') as facturas_recibidas,
  coalesce(sum(valor_neto) filter (where tipo = 'G'), 0) as base_gastos,
  coalesce(sum(iva) filter (where tipo = 'G'), 0) as iva_soportado,
  coalesce(sum(irpf) filter (where tipo = 'G'), 0) as irpf_gastos,
  coalesce(sum(total) filter (where tipo = 'G'), 0) as total_gastos,
  coalesce(sum(iva) filter (where tipo = 'I'), 0) - coalesce(sum(iva) filter (where tipo = 'G'), 0) as iva_a_pagar,
  coalesce(sum(valor_neto) filter (where tipo = 'I'), 0) - coalesce(sum(valor_neto) filter (where tipo = 'G'), 0) as resultado
from public.libro_facturas
group by anio, trimestre;
grant select on public.v_iva_trimestral to authenticated;
