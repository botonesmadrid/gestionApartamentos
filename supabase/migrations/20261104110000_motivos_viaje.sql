-- Aplicada en producción el 2026-11-04.
-- Maestro de motivos del viaje. Los formularios de huéspedes (enlace de reserva y enlace único) toman la lista de
-- aquí, como países, documentos o parentescos. En huespedes.motivo_viaje se guarda el texto ("español / inglés"),
-- que es lo que usa la plantilla del contrato ({{MOTIVO}}) y lo que traía el histórico del Sheet.

create table if not exists public.motivos_viaje (
  codigo text primary key,
  texto text not null unique,       -- "Español. / English": el formulario muestra la parte del idioma elegido
  orden int not null default 100,
  activo boolean not null default true
);
alter table public.motivos_viaje enable row level security;
create policy "gestor acceso total motivos_viaje" on public.motivos_viaje
  for all using (public.es_gestor()) with check (public.es_gestor());

insert into public.motivos_viaje (codigo, texto, orden) values
  ('CULT', 'Visita de carácter cultural. / Cultural visit', 10),
  ('TRAB', 'Trabajo. / Work', 20),
  ('MED',  'Tratamiento médico / Medical treatment', 30),
  ('FAM',  'Visita a familiares o amigos. / Visit of family or friends', 40),
  ('FORM', 'Formación. / Education/training', 50),
  ('EST',  'Desplazamiento por estudios de hijos. / Accompanying children for study purposes', 60),
  ('REF',  'Reforma del hogar. / Home renovation', 70)
on conflict (codigo) do nothing;

create or replace function public._motivos_viaje_json()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'texto', texto) order by orden, texto), '[]')
  from public.motivos_viaje where activo;
$$;
revoke execute on function public._motivos_viaje_json() from public, anon, authenticated;

create or replace function public.formulario_obtener(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare r record;
begin
  select res.id, res.fecha_entrada, res.fecha_salida, res.num_huespedes, res.estado, res.nombre,
         a.piso, (select count(*) from public.huespedes h where h.reserva_id = res.id) registrados,
         (select coalesce(jsonb_agg(h.nombre order by h.created_at), '[]') from public.huespedes h where h.reserva_id = res.id) nombres
    into r
  from public.reservas res join public.apartamentos a on a.id = res.apartamento_id
  where res.formulario_token = p_token;

  if r.id is null then return jsonb_build_object('estado', 'no_encontrado'); end if;
  if r.estado = 'cancelada' or r.fecha_salida < current_date then
    return jsonb_build_object('estado', 'cerrado');
  end if;

  return jsonb_build_object(
    'estado', 'ok',
    'titular', split_part(r.nombre, ' ', 1),
    'piso', r.piso,
    'fecha_entrada', r.fecha_entrada,
    'fecha_salida', r.fecha_salida,
    'num_huespedes', r.num_huespedes,
    'registrados', r.registrados,
    'nombres_registrados', r.nombres,
    'paises', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre) order by nombre) from public.paises),
    'tipos_documento', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.tipos_documento),
    'sexos', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.sexos),
    'parentescos', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion) order by descripcion) from public.parentescos),
    'motivos', public._motivos_viaje_json()
  );
end $function$;

create or replace function public.registro_catalogos()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'estado', 'ok',
    'paises', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre) order by nombre) from public.paises),
    'tipos_documento', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.tipos_documento),
    'sexos', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.sexos),
    'parentescos', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'descripcion', descripcion)) from public.parentescos),
    'motivos', public._motivos_viaje_json());
$$;
