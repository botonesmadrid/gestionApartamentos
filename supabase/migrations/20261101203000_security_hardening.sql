-- Aplicada en producción el 2026-11-01.

-- 1. Los usuarios nuevos ya no son gestores por defecto: entran como 'cliente'
--    (sin acceso a nada hasta que un gestor los vincule a una ficha de cliente).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, rol)
  values (new.id, 'cliente');
  return new;
end;
$$;
alter table public.perfiles alter column rol set default 'cliente';

-- 2. search_path fijo en es_gestor
create or replace function public.es_gestor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = (select auth.uid()) and rol = 'gestor'
  );
$$;

-- 3. Las funciones SECURITY DEFINER no deben poder llamarse por la API (/rpc)
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 4. La app exige login: el rol anon no necesita acceso a ninguna tabla
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
