-- Calculadora → Mão de Obra Exclusiva: planilhas salvas na conta, com histórico de versões e compartilhamento com a equipe.
-- Cada "salvar" cria uma nova versão (mesmo nome e modelo); ficam as 10 últimas de cada planilha.
-- Quem pertence a uma organização (planos de equipe) pode compartilhar a planilha com os demais membros (só leitura).
create table if not exists public.mo_planilhas (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null default auth.uid() references auth.users on delete cascade,
  org_id        uuid references public.organizacoes on delete set null,
  modo          text not null check (modo in ('planejamento', 'repactuacao', 'proposta')),
  nome          text not null check (char_length(btrim(nome)) between 1 and 120),
  versao        int not null default 1,
  dados         jsonb not null check (pg_column_size(dados) <= 400000),
  compartilhada boolean not null default false,
  autor_nome    text,
  criado_em     timestamptz not null default now()
);
create index if not exists mo_planilhas_usuario on public.mo_planilhas (usuario_id, modo, nome, versao desc);
create index if not exists mo_planilhas_org on public.mo_planilhas (org_id) where compartilhada;
alter table public.mo_planilhas enable row level security;

-- ao salvar: dono = quem está logado, número da versão, nome do autor e limite de uso
create or replace function public.mo_planilhas_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para salvar.'; end if;
  new.usuario_id := auth.uid();
  new.nome := btrim(new.nome);
  if new.org_id is not null and new.org_id is distinct from public.org_do_usuario(auth.uid()) then new.org_id := null; end if;
  if new.org_id is null then new.compartilhada := false; end if;
  select count(*) into n from public.mo_planilhas where usuario_id = auth.uid();
  if n >= 300 then raise exception 'Limite de 300 planilhas salvas atingido. Exclua as antigas para salvar novas.'; end if;
  select coalesce(max(versao), 0) + 1 into new.versao from public.mo_planilhas where usuario_id = auth.uid() and modo = new.modo and nome = new.nome;
  select nullif(btrim(p.nome), '') into new.autor_nome from public.perfis p where p.id = auth.uid();
  new.criado_em := now();
  return new;
end $$;
drop trigger if exists mo_planilhas_antes on public.mo_planilhas;
create trigger mo_planilhas_antes before insert on public.mo_planilhas for each row execute function public.mo_planilhas_antes();

create or replace function public.mo_planilhas_depois()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.mo_planilhas where usuario_id = new.usuario_id and modo = new.modo and nome = new.nome and versao <= new.versao - 10;
  return null;
end $$;
drop trigger if exists mo_planilhas_depois on public.mo_planilhas;
create trigger mo_planilhas_depois after insert on public.mo_planilhas for each row execute function public.mo_planilhas_depois();
revoke execute on function public.mo_planilhas_antes(), public.mo_planilhas_depois() from public, anon, authenticated;

drop policy if exists mo_planilhas_ler on public.mo_planilhas;
create policy mo_planilhas_ler on public.mo_planilhas for select to authenticated
  using (usuario_id = auth.uid() or (compartilhada and org_id is not null and org_id = public.org_do_usuario(auth.uid())));
drop policy if exists mo_planilhas_inserir on public.mo_planilhas;
create policy mo_planilhas_inserir on public.mo_planilhas for insert to authenticated
  with check (usuario_id = auth.uid() and (org_id is null or org_id = public.org_do_usuario(auth.uid())));
drop policy if exists mo_planilhas_alterar on public.mo_planilhas;
create policy mo_planilhas_alterar on public.mo_planilhas for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid() and (org_id is null or org_id = public.org_do_usuario(auth.uid())));
drop policy if exists mo_planilhas_excluir on public.mo_planilhas;
create policy mo_planilhas_excluir on public.mo_planilhas for delete to authenticated using (usuario_id = auth.uid());

revoke all on public.mo_planilhas from anon;
revoke all on public.mo_planilhas from authenticated;
grant select, insert, delete on public.mo_planilhas to authenticated;
grant update (compartilhada, org_id) on public.mo_planilhas to authenticated;
