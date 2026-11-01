-- Aplicada en producción el 2026-11-01, en dos pasos para no romper la app desplegada.
-- 'apartamento' y 'piso' tenían siempre el mismo valor: nos quedamos solo con 'piso'.

-- Paso 1 (antes de desplegar el código nuevo)
update public.apartamentos set piso = apartamento where piso is null;
alter table public.apartamentos alter column apartamento drop not null;

-- Paso 2 (después de desplegar el código que ya no usa 'apartamento')
alter table public.apartamentos drop column apartamento;
alter table public.apartamentos alter column piso set not null;
