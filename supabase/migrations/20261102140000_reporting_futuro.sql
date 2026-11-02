-- Aplicada en producción el 2026-11-02.
-- Reporting: "Valor reservas canales futuro", que el gestor informa a mano por cliente, año, mes y canal
-- (la app sugiere la media de los últimos 5 años). Alimenta el KPI "Valor reservas a futuro".

create table if not exists public.reporting_futuro (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  anio int not null,
  mes int not null check (mes between 1 and 12),
  canal text not null,
  importe numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (cliente_id, anio, mes, canal)
);
alter table public.reporting_futuro enable row level security;
create policy "gestor acceso total reporting_futuro" on public.reporting_futuro
  for all using (public.es_gestor()) with check (public.es_gestor());

-- Valores de 2026 de Casa Malasaña facilitados por el gestor.
insert into public.reporting_futuro (cliente_id, anio, mes, canal, importe)
select c.id, 2026, v.mes, v.canal, v.importe
from public.clientes c
cross join (values
  (1, 'Airbnb', 536.00), (2, 'Airbnb', 1638.00), (3, 'Airbnb', 1253.00), (4, 'Airbnb', 1588.00), (5, 'Airbnb', 1572.00), (6, 'Airbnb', 1633.00),
  (7, 'Airbnb', 2859.00), (8, 'Airbnb', 0), (9, 'Airbnb', 1602.00), (10, 'Airbnb', 1858.00), (11, 'Airbnb', 0), (12, 'Airbnb', 0),
  (1, 'Booking', 29058.39), (2, 'Booking', 30305.97), (3, 'Booking', 41230.27), (4, 'Booking', 54631.07), (5, 'Booking', 56253.55), (6, 'Booking', 42533.86),
  (7, 'Booking', 28500.00), (8, 'Booking', 13800.00), (9, 'Booking', 34300.00), (10, 'Booking', 60486.00), (11, 'Booking', 22500.00), (12, 'Booking', 10800.00),
  (4, 'Spotahome/PlumGuide', 2266.00), (5, 'Spotahome/PlumGuide', 1262.00), (6, 'Spotahome/PlumGuide', 1611.00),
  (1, 'Directo', 3020.00), (2, 'Directo', 4000.00), (3, 'Directo', 0), (4, 'Directo', 4289.69), (5, 'Directo', 4165.00), (6, 'Directo', 0),
  (7, 'Directo', 0), (8, 'Directo', 0), (9, 'Directo', 3100.00), (10, 'Directo', 2000.00), (11, 'Directo', 2000.00), (12, 'Directo', 2000.00)
) v(mes, canal, importe)
where c.codigo = 'CM'
on conflict do nothing;
