-- Correos de los channel managers que no se han podido aplicar (resultado 'revisar'): se ven en Entradas.
--  * avisos_canal.descartado_at: el gestor lo ha revisado y lo quita de la lista (p. ej. una cancelación de una
--    reserva que nunca estuvo en la app). El aviso se conserva.
--  * reintentar_aviso(id): vuelve a aplicar un aviso de Avirato o Little Hotelier, p. ej. después de poner en
--    Maestros el Room Id que faltaba. Si vuelve a fallar, queda otra vez en 'revisar' con el nuevo motivo.

alter table public.avisos_canal add column if not exists descartado_at timestamptz;
create index if not exists avisos_canal_revisar_idx on public.avisos_canal (recibido_at)
  where resultado = 'revisar' and descartado_at is null;

create or replace function public.reintentar_aviso(p_aviso uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.avisos_canal;
begin
  if not public.es_gestor() then raise exception 'Solo gestores'; end if;
  select * into a from public.avisos_canal where id = p_aviso for update;
  if a.id is null then raise exception 'No se encuentra el aviso'; end if;
  if a.resultado <> 'revisar' then raise exception 'Este aviso ya no está pendiente de revisar'; end if;
  if a.canal not in ('avirato', 'littlehotelier') or a.datos is null then
    raise exception 'Este aviso no se puede reintentar desde aquí';
  end if;
  delete from public.avisos_canal where id = a.id;
  return public.registrar_aviso_canal(a.datos || jsonb_build_object('cuerpo', a.cuerpo));
end $$;
revoke execute on function public.reintentar_aviso(uuid) from public, anon;
grant execute on function public.reintentar_aviso(uuid) to authenticated;
