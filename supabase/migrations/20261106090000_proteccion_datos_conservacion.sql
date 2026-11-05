-- Aplicada en producción el 2026-11-05 (desde el editor SQL de Supabase).
-- Protección de datos (RGPD art. 5.1.e, limitación del plazo de conservación): supresión automática de los datos
-- personales una vez vencidos los plazos legales.
--   * Registro de viajeros (huespedes y envíos del formulario): 3 años desde el fin de la estancia (art. 5 del
--     RD 933/2021). Pasado ese plazo no hay base legal para conservarlos.
--   * Cabecera de la entrada (nombre, apellidos y teléfono de quien reserva): 6 años desde la salida (obligaciones
--     contables y fiscales, art. 30 Código de Comercio). Después se anonimiza; los importes y fechas se mantienen
--     para el reporting.
--   * Correos de los channel managers (avisos_canal: asunto, cuerpo y datos extraídos): 6 meses. Solo sirven para
--     crear/actualizar entradas; pasado ese tiempo se conserva el registro técnico sin el contenido.
-- Los documentos fuera de la base de datos (contratos y XML de SES en Google Drive, Dropbox Sign, Gmail) siguen los
-- mismos plazos pero se borran a mano: ver docs/proteccion-datos.md.

-- La casilla del formulario ya no es un consentimiento (la base es la obligación legal y el contrato): confirma que
-- el huésped recibió la información del art. 13 RGPD.
comment on column public.huespedes.consentimiento_at is
  'Fecha en que el huésped confirmó haber leído la información de protección de datos (art. 13 RGPD). No es un consentimiento: la base del tratamiento es la obligación legal (RD 933/2021) y el contrato.';

-- p_hoy: fecha de referencia (por defecto hoy); solo sirve para probarla simulando otra fecha.
create or replace function public.purgar_datos_caducados(p_hoy date default current_date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_huespedes int := 0;
  v_n int;
  v_registros int;
  v_reservas int;
  v_avisos int;
begin
  -- 1. Huéspedes de estancias terminadas hace más de 3 años. Se conserva la fecha en que se completó el formulario
  --    (el trigger de huespedes la pondría a null al quedarse la entrada sin huéspedes).
  for r in
    select res.id, res.formulario_completado_at
    from public.reservas res
    where res.fecha_salida < p_hoy - interval '3 years'
      and exists (select 1 from public.huespedes h where h.reserva_id = res.id)
  loop
    update public.reservas set titular_huesped_id = null, contrato_titular_huesped_id = null where id = r.id;
    delete from public.huespedes where reserva_id = r.id;
    get diagnostics v_n = row_count;
    v_huespedes := v_huespedes + v_n;
    update public.reservas set formulario_completado_at = r.formulario_completado_at where id = r.id;
  end loop;

  -- 2. Envíos del formulario de enlace único (pendientes, vinculados o descartados) de hace más de 3 años.
  delete from public.registros_huespedes
  where coalesce(fecha_salida, fecha_entrada) < p_hoy - interval '3 years';
  get diagnostics v_registros = row_count;

  -- 3. Cabecera de las entradas con salida hace más de 6 años: se anonimiza.
  update public.reservas
  set nombre = 'Anonimizado', apellido1 = null, apellido2 = null, telefono = null
  where fecha_salida < p_hoy - interval '6 years'
    and (nombre <> 'Anonimizado' or apellido1 is not null or apellido2 is not null or telefono is not null);
  get diagnostics v_reservas = row_count;

  -- 4. Contenido de los correos de los channel managers de hace más de 6 meses.
  update public.avisos_canal
  set asunto = null, cuerpo = null, datos = null
  where coalesce(recibido_at, created_at) < p_hoy - interval '6 months'
    and (asunto is not null or cuerpo is not null or datos is not null);
  get diagnostics v_avisos = row_count;

  return jsonb_build_object('huespedes', v_huespedes, 'registros_huespedes', v_registros,
    'reservas_anonimizadas', v_reservas, 'avisos_canal', v_avisos);
end $$;
revoke execute on function public.purgar_datos_caducados(date) from public, anon, authenticated;

-- Todos los días a las 03:40 (UTC).
select cron.unschedule('purgar-datos-caducados') where exists (select 1 from cron.job where jobname = 'purgar-datos-caducados');
select cron.schedule('purgar-datos-caducados', '40 3 * * *', 'select public.purgar_datos_caducados()');
