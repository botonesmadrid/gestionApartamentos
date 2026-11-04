-- Aplicada en producción el 2026-11-04.
-- Para quién se generó el contrato de una entrada (lo guarda la función generar-contrato). Si el titular cambia
-- después y el contrato aún no está firmado, la app avisa de que hay que regenerarlo.
alter table public.reservas add column if not exists contrato_titular_huesped_id uuid;

-- Contratos generados por la app: se generaron para el titular marcado en ese momento.
update public.reservas set contrato_titular_huesped_id = titular_huesped_id
where contrato_generado_at is not null and titular_huesped_id is not null and contrato_titular_huesped_id is null;
