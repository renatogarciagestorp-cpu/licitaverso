-- Regulamentação específica enviada pelo assinante (decreto estadual/municipal, RILC de estatal etc.), usada nas análises do agente.
create table if not exists public.normas_usuario (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users on delete cascade,
  criado_em   timestamptz not null default now(),
  nome        text not null check (char_length(nome) between 3 and 200),   -- ex.: "Decreto Municipal nº 78/2025 (Maricá)"
  arquivo     text not null,                                               -- caminho no bucket "analises": <usuario>/normas/...
  tamanho     bigint not null default 0
);
create index if not exists normas_usuario_dono on public.normas_usuario (usuario_id, criado_em desc);
alter table public.normas_usuario enable row level security;
drop policy if exists normas_ler on public.normas_usuario;
create policy normas_ler on public.normas_usuario for select to authenticated using (usuario_id = auth.uid() or public.is_admin());
drop policy if exists normas_incluir on public.normas_usuario;
create policy normas_incluir on public.normas_usuario for insert to authenticated
  with check (usuario_id = auth.uid() and arquivo like auth.uid()::text || '/normas/%');
drop policy if exists normas_apagar on public.normas_usuario;
create policy normas_apagar on public.normas_usuario for delete to authenticated using (usuario_id = auth.uid());

-- Normas escolhidas para cada análise (cópia do nome e do caminho no momento do pedido)
alter table public.analises add column if not exists normas jsonb not null default '[]'::jsonb;

-- Quem apaga a norma da lista também pode apagar o arquivo da própria pasta
drop policy if exists analises_arquivos_apagar_normas on storage.objects;
create policy analises_arquivos_apagar_normas on storage.objects for delete to authenticated
  using (bucket_id = 'analises' and (storage.foldername(name))[1] = auth.uid()::text and (storage.foldername(name))[2] = 'normas');
