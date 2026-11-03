-- Pendiente de aplicar en producción (editor SQL de Supabase).
-- Enlace general del formulario de huéspedes (/registro), el mismo para todas las reservas, para usarlo en las
-- plantillas de mensajes de los portales. El huésped escribe su número de reserva y su fecha de entrada y se le
-- lleva al formulario de su reserva (/f/<token>).
-- Contra intentos de adivinar códigos: como mucho 60 búsquedas fallidas por hora en total; después se rechazan.

create table if not exists public.formulario_busquedas (
  id bigserial primary key,
  at timestamptz not null default now(),
  encontrada boolean not null
);
alter table public.formulario_busquedas enable row level security; -- sin políticas: solo la función

create or replace function public.formulario_buscar(p_codigo text, p_entrada date)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
        v_tokens uuid[];
begin
  if length(v_codigo) < 5 or p_entrada is null then return jsonb_build_object('estado', 'no_encontrado'); end if;
  if (select count(*) from public.formulario_busquedas where not encontrada and at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('estado', 'demasiados_intentos');
  end if;

  select array_agg(r.formulario_token) into v_tokens
  from public.reservas r
  where upper(regexp_replace(coalesce(r.codigo_reserva, ''), '[^A-Za-z0-9]', '', 'g')) = v_codigo
    and r.fecha_entrada = p_entrada and r.estado <> 'cancelada' and r.fecha_salida >= current_date;

  insert into public.formulario_busquedas (encontrada) values (coalesce(array_length(v_tokens, 1), 0) = 1);
  delete from public.formulario_busquedas where at < now() - interval '7 days';

  if coalesce(array_length(v_tokens, 1), 0) <> 1 then return jsonb_build_object('estado', 'no_encontrado'); end if;
  return jsonb_build_object('estado', 'ok', 'token', v_tokens[1]);
end $$;
revoke execute on function public.formulario_buscar(text, date) from public;
grant execute on function public.formulario_buscar(text, date) to anon, authenticated;
