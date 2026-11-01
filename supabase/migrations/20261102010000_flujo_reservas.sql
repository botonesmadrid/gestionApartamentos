-- Aplicada en producción el 2026-11-02.
-- Flujo de cada reserva: aviso del canal → importe con comisión → formulario de huéspedes y
-- contrato firmado (en paralelo) → check-in. Se puede cancelar en cualquier momento.
-- Cada paso guarda cuándo se hizo; la fase se calcula sola a partir de esos pasos.

alter table public.reservas
  add column if not exists formulario_enviado_at timestamptz,
  add column if not exists formulario_completado_at timestamptz,
  add column if not exists contrato_enviado_at timestamptz,
  add column if not exists contrato_firmado_at timestamptz,
  add column if not exists checkin_at timestamptz;

alter table public.reservas add column if not exists fase text generated always as (
  case
    when estado = 'cancelada' then 'cancelada'
    when importe_pendiente then 'pendiente_importe'
    when checkin_at is not null then 'checkin_completado'
    when formulario_completado_at is null or contrato_firmado_at is null then 'pendiente_documentacion'
    else 'lista_checkin'
  end
) stored;
create index if not exists reservas_fase_idx on public.reservas (fase);

-- Histórico del Sheet: los huéspedes ya están registrados → formulario completado.
update public.reservas r set formulario_completado_at = coalesce(
    (select min(h.created_at) from public.huespedes h where h.reserva_id = r.id), r.created_at)
where r.canal = 'sheet' and r.formulario_completado_at is null
  and exists (select 1 from public.huespedes h where h.reserva_id = r.id);

-- Histórico del Sheet con fecha de entrada ya pasada → check-in completado.
update public.reservas set checkin_at = fecha_entrada::timestamptz
where canal = 'sheet' and checkin_at is null and fecha_entrada <= current_date;
