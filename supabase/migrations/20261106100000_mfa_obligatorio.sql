-- PENDIENTE DE APLICAR en producción, DESPUÉS de desplegar la app con la pantalla /cuenta/verificacion.
-- Verificación en dos pasos (MFA) obligatoria también en la base de datos: una sesión que solo ha puesto la contraseña
-- (nivel aal1) no ve ni modifica ningún dato, aunque llame directamente a la API de Supabase.
--   * Política RESTRICTIVA en todas las tablas de public para el rol authenticated: se suma (AND) a las existentes.
--   * es_gestor() exige aal2: cubre las funciones SECURITY DEFINER (que no pasan por RLS) y las Edge Functions.
-- No afecta al formulario público de huéspedes (rol anon, funciones SECURITY DEFINER) ni a las tareas programadas
-- (service_role). Las tablas nuevas deben añadir la misma política.

do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('drop policy if exists "mfa obligatorio" on public.%I', t.relname);
    execute format('create policy "mfa obligatorio" on public.%I as restrictive for all to authenticated '
                   'using ((select auth.jwt() ->> ''aal'') = ''aal2'') with check ((select auth.jwt() ->> ''aal'') = ''aal2'')',
                   t.relname);
  end loop;
end $$;

create or replace function public.es_gestor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.jwt() ->> 'aal') = 'aal2'
     and exists (
       select 1 from public.perfiles
       where id = (select auth.uid()) and rol = 'gestor'
     );
$$;
