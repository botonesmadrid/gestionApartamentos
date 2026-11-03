-- Aplicada en producción el 2026-11-03.
-- Maestro de conceptos de gasto (la "familia" de las facturas recibidas del libro) con el check "impacta en el IVA".
-- Solo los conceptos marcados cuentan en el IVA trimestral (facturas recibidas, base de gastos e IVA soportado).
-- El concepto "No" viene sin marcar; los nuevos, marcados. Un concepto nuevo usado en el libro se da de alta solo.

create table if not exists public.conceptos_gasto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  impacta_iva boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.conceptos_gasto enable row level security;
create policy "gestor acceso total conceptos_gasto" on public.conceptos_gasto
  for all using (public.es_gestor()) with check (public.es_gestor());

insert into public.conceptos_gasto (nombre, impacta_iva)
select distinct familia, lower(familia) <> 'no'
from public.libro_facturas where tipo = 'G' and familia is not null
on conflict (nombre) do nothing;

create or replace function public.libro_facturas_alta_concepto()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'G' and nullif(trim(new.familia), '') is not null then
    insert into public.conceptos_gasto (nombre) values (trim(new.familia)) on conflict (nombre) do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.libro_facturas_alta_concepto() from public, anon, authenticated;
drop trigger if exists libro_facturas_alta_concepto on public.libro_facturas;
create trigger libro_facturas_alta_concepto before insert or update of familia, tipo on public.libro_facturas
  for each row execute function public.libro_facturas_alta_concepto();

-- IVA trimestral: los gastos solo cuentan si su concepto impacta en el IVA (sin concepto: cuentan).
-- El total y el IRPF de gastos y el resultado siguen incluyendo todos los gastos.
create or replace view public.v_iva_trimestral with (security_invoker = true) as
with l as (
  select f.*, f.tipo = 'G' and coalesce(c.impacta_iva, true) as gasto_iva
  from public.libro_facturas f
  left join public.conceptos_gasto c on f.tipo = 'G' and c.nombre = f.familia
)
select anio, trimestre,
  count(*) filter (where tipo = 'I') as facturas_emitidas,
  coalesce(sum(valor_neto) filter (where tipo = 'I'), 0) as base_ingresos,
  coalesce(sum(iva) filter (where tipo = 'I'), 0) as iva_repercutido,
  coalesce(sum(irpf) filter (where tipo = 'I'), 0) as irpf_ingresos,
  coalesce(sum(total) filter (where tipo = 'I'), 0) as total_ingresos,
  count(*) filter (where gasto_iva) as facturas_recibidas,
  coalesce(sum(valor_neto) filter (where gasto_iva), 0) as base_gastos,
  coalesce(sum(iva) filter (where gasto_iva), 0) as iva_soportado,
  coalesce(sum(irpf) filter (where tipo = 'G'), 0) as irpf_gastos,
  coalesce(sum(total) filter (where tipo = 'G'), 0) as total_gastos,
  coalesce(sum(iva) filter (where tipo = 'I'), 0) - coalesce(sum(iva) filter (where gasto_iva), 0) as iva_a_pagar,
  coalesce(sum(valor_neto) filter (where tipo = 'I'), 0) - coalesce(sum(valor_neto) filter (where tipo = 'G'), 0) as resultado
from l
group by anio, trimestre;
grant select on public.v_iva_trimestral to authenticated;
