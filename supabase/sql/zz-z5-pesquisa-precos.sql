-- O Elaborador → Pesquisa de preços: pesquisas salvas (para reabrir e levar ao Termo de Referência) e registro
-- de uso das funções com IA (filtro de itens semelhantes e leitura do regulamento interno), para os limites diários.
create table if not exists public.pesquisas_preco (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null default auth.uid() references auth.users on delete cascade,
  titulo        text not null check (char_length(btrim(titulo)) between 1 and 200),
  regime        text not null default '14133' check (regime in ('14133', '13303', '13019')),
  objeto_tipo   text not null default 'bens' check (objeto_tipo in ('bens', 'mao_obra', 'obras')),
  valor_total   numeric(16, 2),
  dados         jsonb not null default '{}'::jsonb check (pg_column_size(dados) <= 900000),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pesquisas_preco_usuario on public.pesquisas_preco (usuario_id, atualizado_em desc);
alter table public.pesquisas_preco enable row level security;

create or replace function public.pesquisas_preco_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para salvar.'; end if;
  if tg_op = 'INSERT' then
    new.usuario_id := auth.uid();
    select count(*) into n from public.pesquisas_preco where usuario_id = auth.uid();
    if n >= 300 then raise exception 'Limite de 300 pesquisas salvas atingido. Exclua as antigas para salvar novas.'; end if;
    new.criado_em := now();
  else
    new.usuario_id := old.usuario_id; new.criado_em := old.criado_em;
  end if;
  new.titulo := btrim(new.titulo);
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists pesquisas_preco_antes on public.pesquisas_preco;
create trigger pesquisas_preco_antes before insert or update on public.pesquisas_preco for each row execute function public.pesquisas_preco_antes();
revoke execute on function public.pesquisas_preco_antes() from public, anon, authenticated;

drop policy if exists pesquisas_preco_ler on public.pesquisas_preco;
create policy pesquisas_preco_ler on public.pesquisas_preco for select to authenticated using (usuario_id = auth.uid());
drop policy if exists pesquisas_preco_inserir on public.pesquisas_preco;
create policy pesquisas_preco_inserir on public.pesquisas_preco for insert to authenticated with check (usuario_id = auth.uid());
drop policy if exists pesquisas_preco_alterar on public.pesquisas_preco;
create policy pesquisas_preco_alterar on public.pesquisas_preco for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
drop policy if exists pesquisas_preco_excluir on public.pesquisas_preco;
create policy pesquisas_preco_excluir on public.pesquisas_preco for delete to authenticated using (usuario_id = auth.uid());
revoke all on public.pesquisas_preco from anon;
revoke all on public.pesquisas_preco from authenticated;
grant select, insert, update, delete on public.pesquisas_preco to authenticated;

-- uso das funções com IA e das consultas às bases públicas (gravado só pela função pesquisa-precos, com a chave de serviço)
create table if not exists public.pesquisa_precos_usos (
  id         bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users on delete cascade,
  tipo       text not null check (tipo in ('coleta', 'ia_similares', 'ia_rilc')),
  tokens     integer,
  criado_em  timestamptz not null default now()
);
create index if not exists pesquisa_precos_usos_usuario on public.pesquisa_precos_usos (usuario_id, tipo, criado_em desc);
alter table public.pesquisa_precos_usos enable row level security;
revoke all on public.pesquisa_precos_usos from anon, authenticated;
