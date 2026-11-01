-- Aplicada en producción el 2026-11-02.
-- Histórico importado del Sheet: todos los contratos se consideran firmados.
update public.reservas set contrato_firmado_at = coalesce(checkin_at, created_at)
where canal = 'sheet' and contrato_firmado_at is null;
