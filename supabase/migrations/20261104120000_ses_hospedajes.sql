-- Aplicada en producción el 2026-11-04.
-- Fase "SES Hospedajes" entre el contrato y el check-in: se genera el XML del parte de viajeros (Ministerio del
-- Interior) en la carpeta de Drive de la entrada (función ses-hospedajes), se sube a mano a la plataforma SES y se
-- marca en la app como comunicado. Las entradas con check-in hecho no cambian de fase.

alter table public.reservas
  add column if not exists ses_xml_id text,                 -- XML generado en Drive
  add column if not exists ses_generado_at timestamptz,
  add column if not exists ses_comunicado_at timestamptz;   -- check manual: subido a SES Hospedajes

alter table public.reservas alter column fase set expression as (
  case
    when estado = 'cancelada' then 'cancelada'
    when importe_pendiente or piso_pendiente then 'pendiente_importe'
    when checkin_at is not null then 'checkin_completado'
    when formulario_completado_at is null or contrato_firmado_at is null then 'pendiente_documentacion'
    when ses_comunicado_at is null then 'pendiente_ses'
    else 'lista_checkin'
  end);
