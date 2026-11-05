-- Aplicada en producción el 2026-11-05 (desde el editor SQL de Supabase).
-- Rendimiento de RLS e índices (avisos del linter de Supabase: auth_rls_initplan, multiple_permissive_policies,
-- unindexed_foreign_keys). No cambia quién puede ver qué:
--   * auth.uid(), auth.jwt() y es_gestor() van dentro de (select …): Postgres los calcula una vez por consulta y no
--     una vez por fila.
--   * Las políticas pasan a aplicarse solo al rol authenticated (el público no tiene permisos sobre las tablas).
--   * Se eliminan tres políticas heredadas (gestor_id = auth.uid()) que repetían lo que ya da «gestor acceso total».
--   * Índices en las claves foráneas que se usan para filtrar o en borrados en cascada.

-- 1. Políticas heredadas, redundantes con «gestor acceso total …».
drop policy if exists "apartamentos: propietario ve/gestiona los suyos" on public.apartamentos;
drop policy if exists "reservas: solo del propio apartamento" on public.reservas;
drop policy if exists "huespedes: solo de las propias reservas" on public.huespedes;

-- 2. Políticas de gestor: es_gestor() una vez por consulta y solo para authenticated.
do $$
declare p record;
begin
  for p in select c.relname tabla, pol.polname nombre
           from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and pg_get_expr(pol.polqual, pol.polrelid) = 'es_gestor()' loop
    execute format('alter policy %I on public.%I to authenticated using ((select public.es_gestor())) with check ((select public.es_gestor()))',
                   p.nombre, p.tabla);
  end loop;
end $$;

-- 3. Catálogos: lectura para cualquier usuario con sesión (la verificación en dos pasos la exige «mfa obligatorio»).
do $$
declare t text;
begin
  foreach t in array array['formas_pago', 'municipios', 'paises', 'parentescos', 'provincias', 'sexos', 'tipos_documento'] loop
    execute format('alter policy %I on public.%I to authenticated using (true)', 'cualquier usuario autenticado lee ' || t, t);
  end loop;
end $$;
alter policy "cualquier usuario autenticado lee origenes" on public.origenes_reserva to authenticated using (true);

-- 4. Propietarios (rol cliente) y perfil propio, con auth.uid() calculado una vez.
alter policy "cliente ve su propia ficha" on public.clientes to authenticated
  using (user_id = (select auth.uid()));
alter policy "cliente ve sus apartamentos" on public.apartamentos to authenticated
  using (cliente_id in (select c.id from public.clientes c where c.user_id = (select auth.uid())));
alter policy "cliente ve reservas de sus apartamentos" on public.reservas to authenticated
  using (apartamento_id in (select a.id from public.apartamentos a join public.clientes c on c.id = a.cliente_id
                            where c.user_id = (select auth.uid())));
alter policy "usuarios ven su propio perfil" on public.perfiles to authenticated
  using (id = (select auth.uid()));

-- 5. MFA obligatorio: auth.jwt() una vez por consulta.
do $$
declare t record;
begin
  for t in select c.relname from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and pol.polname = 'mfa obligatorio' loop
    execute format('alter policy "mfa obligatorio" on public.%I to authenticated '
                   'using (((select auth.jwt()) ->> ''aal'') = ''aal2'') with check (((select auth.jwt()) ->> ''aal'') = ''aal2'')',
                   t.relname);
  end loop;
end $$;

create or replace function public.es_gestor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select ((select auth.jwt()) ->> 'aal') = 'aal2'
     and exists (
       select 1 from public.perfiles
       where id = (select auth.uid()) and rol = 'gestor'
     );
$$;

-- 6. Índices en claves foráneas (filtros por cliente, líneas de factura y borrados en cascada / set null).
create index if not exists apartamentos_cliente_id_idx on public.apartamentos (cliente_id);
create index if not exists avisos_canal_reserva_id_idx on public.avisos_canal (reserva_id);
create index if not exists clientes_user_id_idx on public.clientes (user_id);
create index if not exists facturas_cliente_id_idx on public.facturas (cliente_id);
create index if not exists facturas_serie_id_idx on public.facturas (serie_id);
create index if not exists facturas_rectifica_id_idx on public.facturas (rectifica_id);
create index if not exists facturas_lineas_factura_id_idx on public.facturas_lineas (factura_id);
create index if not exists ingresos_cliente_id_idx on public.ingresos (cliente_id);
create index if not exists registros_huespedes_cliente_id_idx on public.registros_huespedes (cliente_id);
create index if not exists reservas_titular_huesped_id_idx on public.reservas (titular_huesped_id);
create index if not exists series_facturacion_cliente_id_idx on public.series_facturacion (cliente_id);
