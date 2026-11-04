-- Aplicada en producción el 2026-11-04.
-- Arreglo: cambiar el nº de huéspedes desde la app fallaba con "permission denied for function
-- sincronizar_formulario". El trigger que la llama se ejecutaba con los permisos del gestor, que no puede ejecutar
-- esa función interna. Ahora se ejecuta con los permisos de su propietario (como el resto de triggers que la usan).
alter function public.reservas_sincronizar_formulario() security definer;
revoke execute on function public.reservas_sincronizar_formulario() from public, anon, authenticated;
