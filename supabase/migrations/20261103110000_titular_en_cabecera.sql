-- Aplicada en producción el 2026-11-03.
-- Al marcar un huésped como titular de la entrada, su nombre y apellidos pasan a la cabecera de la entrada
-- (y su teléfono, si la entrada no tiene). Si después se corrige el nombre de ese huésped, la cabecera se actualiza.

create or replace function public.reservas_titular_a_cabecera()
returns trigger language plpgsql security definer set search_path = '' as $$
declare h public.huespedes;
begin
  if new.titular_huesped_id is not null and new.titular_huesped_id is distinct from old.titular_huesped_id then
    select * into h from public.huespedes where id = new.titular_huesped_id;
    if h.id is not null and coalesce(trim(h.nombre), '') <> '' then
      new.nombre := trim(h.nombre);
      new.apellido1 := nullif(trim(h.apellido1), '');
      new.apellido2 := nullif(trim(h.apellido2), '');
      new.telefono := coalesce(new.telefono, nullif(trim(h.telefono), ''));
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.reservas_titular_a_cabecera() from public, anon, authenticated;
drop trigger if exists reservas_titular_a_cabecera on public.reservas;
create trigger reservas_titular_a_cabecera before update of titular_huesped_id on public.reservas
  for each row execute function public.reservas_titular_a_cabecera();

create or replace function public.huespedes_titular_a_cabecera()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(new.nombre), '') <> '' then
    update public.reservas
    set nombre = trim(new.nombre), apellido1 = nullif(trim(new.apellido1), ''), apellido2 = nullif(trim(new.apellido2), '')
    where titular_huesped_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.huespedes_titular_a_cabecera() from public, anon, authenticated;
drop trigger if exists huespedes_titular_a_cabecera on public.huespedes;
create trigger huespedes_titular_a_cabecera after update of nombre, apellido1, apellido2 on public.huespedes
  for each row execute function public.huespedes_titular_a_cabecera();

-- Entradas existentes cuyo titular marcado no coincide con la cabecera.
update public.reservas r
set nombre = trim(h.nombre), apellido1 = nullif(trim(h.apellido1), ''), apellido2 = nullif(trim(h.apellido2), '')
from public.huespedes h
where h.id = r.titular_huesped_id and coalesce(trim(h.nombre), '') <> ''
  and (lower(trim(r.nombre)) is distinct from lower(trim(h.nombre))
       or lower(trim(coalesce(r.apellido1, ''))) is distinct from lower(trim(coalesce(h.apellido1, ''))));
