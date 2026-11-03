-- Aplicada en producción el 2026-11-03 (desde el editor SQL de Supabase).
-- Limpieza: funciones del formulario con enlace por propiedad (sustituidas por el enlace único /registro) y la copia
-- de seguridad de las firmas de octubre-noviembre de 2026 (verificación dada por buena).
drop function if exists public.registro_catalogos(text);
drop function if exists public.registro_municipios(text, text);
drop function if exists public.registro_enviar(text, jsonb);
drop table if exists public.respaldo_firmas_2026_11;
