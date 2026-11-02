-- Aplicada en producción el 2026-11-02.
-- Nº de factura: AAMM (fin del periodo) + código de serie, p. ej. 261001. Si ya existe, -2, -3…
-- La comprobación incluye las facturas históricas del Sheet y el libro de facturas emitidas.
create or replace function public._numero_factura_libre(p_base text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v text := p_base; n int := 1;
begin
  while exists (select 1 from public.facturas where numero = v)
     or exists (select 1 from public.libro_facturas where tipo = 'I' and numero_factura = v) loop
    n := n + 1; v := p_base || '-' || n;
  end loop;
  return v;
end $$;
revoke execute on function public._numero_factura_libre(text) from public, anon, authenticated;
