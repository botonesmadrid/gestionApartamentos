-- Aplicada en producción el 2026-11-03.
-- Primera fase de una entrada: "Información obligatoria" = piso e importe. La entrada no avanza mientras falte el
-- importe (importe_pendiente) o el piso: piso_pendiente = está en "SIN ASIGNAR" y aún no se ha hecho el check-in
-- (el histórico en SIN ASIGNAR, ya con check-in, no queda pendiente). La fase conserva su clave 'pendiente_importe'.

alter table public.reservas add column if not exists piso_pendiente boolean not null default false;

create or replace function public.reservas_piso_pendiente()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.piso_pendiente := new.checkin_at is null
    and exists (select 1 from public.apartamentos a where a.id = new.apartamento_id and a.piso = 'SIN ASIGNAR');
  return new;
end $$;
create trigger reservas_piso_pendiente before insert or update of apartamento_id, checkin_at on public.reservas
  for each row execute function public.reservas_piso_pendiente();

update public.reservas r set piso_pendiente = true
from public.apartamentos a
where a.id = r.apartamento_id and a.piso = 'SIN ASIGNAR' and r.checkin_at is null;

alter table public.reservas alter column fase set expression as (
  case
    when estado = 'cancelada' then 'cancelada'
    when importe_pendiente or piso_pendiente then 'pendiente_importe'
    when checkin_at is not null then 'checkin_completado'
    when formulario_completado_at is null or contrato_firmado_at is null then 'pendiente_documentacion'
    else 'lista_checkin'
  end);
