-- Plano de Contratações Anual (PCA) na Gestão Contratual: itens planejados por exercício e setor requisitante.
-- Base: Lei 14.133/2021, art. 12, VII e § 1º, e art. 18; Decreto federal 10.947/2022 (referência para os demais entes).
create table if not exists public.pca_itens (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null default auth.uid() references auth.users on delete cascade,
  org_id        uuid references public.organizacoes on delete set null,
  compartilhado boolean not null default false,
  ano           int not null check (ano between 2020 and 2100),
  setor         text not null check (char_length(btrim(setor)) between 1 and 160),
  descricao     text not null check (char_length(btrim(descricao)) between 1 and 400),
  categoria     text check (categoria is null or categoria in ('material', 'servico', 'obra', 'tic')),
  valor         numeric(14, 2) not null check (valor >= 0),
  prioridade    text not null default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  mes           int check (mes is null or mes between 1 and 12),       -- mês pretendido para a contratação
  situacao      text not null default 'planejado' check (situacao in ('planejado', 'em_contratacao', 'contratado', 'cancelado')),
  justificativa text check (char_length(justificativa) <= 600),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pca_itens_usuario on public.pca_itens (usuario_id, ano);
alter table public.pca_itens enable row level security;

create or replace function public.pca_itens_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para salvar.'; end if;
  if tg_op = 'INSERT' then
    new.usuario_id := auth.uid();
    select count(*) into n from public.pca_itens where usuario_id = auth.uid();
    if n >= 3000 then raise exception 'Limite de 3.000 itens do PCA atingido.'; end if;
    new.criado_em := now();
  else
    new.usuario_id := old.usuario_id; new.criado_em := old.criado_em;
  end if;
  new.setor := btrim(new.setor); new.descricao := btrim(new.descricao);
  if new.org_id is not null and new.org_id is distinct from public.org_do_usuario(auth.uid()) then new.org_id := null; end if;
  if new.org_id is null then new.compartilhado := false; end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists pca_itens_antes on public.pca_itens;
create trigger pca_itens_antes before insert or update on public.pca_itens for each row execute function public.pca_itens_antes();
revoke execute on function public.pca_itens_antes() from public, anon, authenticated;

drop policy if exists pca_itens_ler on public.pca_itens;
create policy pca_itens_ler on public.pca_itens for select to authenticated
  using (usuario_id = auth.uid() or (compartilhado and org_id is not null and org_id = public.org_do_usuario(auth.uid())));
drop policy if exists pca_itens_inserir on public.pca_itens;
create policy pca_itens_inserir on public.pca_itens for insert to authenticated with check (usuario_id = auth.uid());
drop policy if exists pca_itens_alterar on public.pca_itens;
create policy pca_itens_alterar on public.pca_itens for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
drop policy if exists pca_itens_excluir on public.pca_itens;
create policy pca_itens_excluir on public.pca_itens for delete to authenticated using (usuario_id = auth.uid());
revoke all on public.pca_itens from anon;
revoke all on public.pca_itens from authenticated;
grant select, insert, update, delete on public.pca_itens to authenticated;

-- vínculo do contrato com o item do PCA que ele executa
alter table public.contratos add column if not exists pca_item uuid references public.pca_itens on delete set null;
