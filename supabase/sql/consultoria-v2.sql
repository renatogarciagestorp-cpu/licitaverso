-- Consultoria v2: aceite das condições, anexos, link de entrega e aviso por e-mail.
alter table public.consultorias add column if not exists termo_aceito_em timestamptz;
alter table public.consultorias add column if not exists termo_versao text;
alter table public.consultorias add column if not exists anexos jsonb not null default '[]'::jsonb;
alter table public.consultorias add column if not exists entrega_link text not null default '';
alter table public.consultorias add column if not exists avisado_status text;
grant update (entrega_link) on public.consultorias to authenticated;

-- Arquivos dos pedidos: bucket privado; cada pessoa só envia e lê na própria pasta; o admin lê tudo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consultorias', 'consultorias', false, 10485760, array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv', 'text/plain', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists consultorias_arquivos_enviar on storage.objects;
create policy consultorias_arquivos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'consultorias' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists consultorias_arquivos_ler on storage.objects;
create policy consultorias_arquivos_ler on storage.objects for select to authenticated
  using (bucket_id = 'consultorias' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists consultorias_arquivos_apagar on storage.objects;
create policy consultorias_arquivos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'consultorias' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
