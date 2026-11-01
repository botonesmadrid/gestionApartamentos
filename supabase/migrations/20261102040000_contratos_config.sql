-- Aplicada en producción el 2026-11-02.
-- Contratos en PDF: configuración por cliente y datos del contrato en cada reserva.
alter table public.clientes
  add column if not exists drive_carpeta_id text,     -- carpeta raíz de contratos en Drive
  add column if not exists drive_plantilla_id text;   -- plantilla de contrato (Google Docs)

alter table public.reservas
  add column if not exists titular_huesped_id uuid references public.huespedes(id) on delete set null,
  add column if not exists contrato_generado_at timestamptz,
  add column if not exists contrato_pdf_id text,
  add column if not exists contrato_carpeta_id text;

update public.clientes set drive_plantilla_id = '1hivFD17uF7UX_zvOkF-tmlf_zbsV3vlj5RPzMyE6J2c',
  drive_carpeta_id = '12zZ2ITgX-mqSZxenqnly-zhz-R8b46uu' where codigo = 'BA';
update public.clientes set drive_plantilla_id = '1xDpQsDbzXgLbTYPe5T0yNusprXUXtFK5GX-AqxfCOqw',
  drive_carpeta_id = '1oLRhusMGLnkdJcHbNxYleKWdtj-23nlx' where codigo = 'CM';
