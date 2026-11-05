-- Calculadora → Meus contratos: cadastro do contrato e linha do tempo (reajustes, repactuações, reequilíbrios,
-- aditivos e prorrogações). O dono edita; quem é da mesma equipe vê os contratos compartilhados (só leitura).
create table if not exists public.contratos (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null default auth.uid() references auth.users on delete cascade,
  org_id        uuid references public.organizacoes on delete set null,
  compartilhado boolean not null default false,
  numero        text not null check (char_length(btrim(numero)) between 1 and 60),
  contratante   text check (char_length(contratante) <= 200),
  contratada    text check (char_length(contratada) <= 200),
  objeto        text check (char_length(objeto) <= 400),
  regime        text not null default '14133' check (regime in ('14133', '13303', '13019')),
  data_proposta date,                -- orçamento estimado ou proposta: base da anualidade do reajuste
  inicio        date,
  fim           date,                -- fim da vigência atual
  valor_inicial numeric(14, 2) check (valor_inicial is null or valor_inicial >= 0),
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal', 'global')),
  indice        text check (indice is null or indice in ('ipca', 'ipca_e', 'inpc', 'igpm', 'igpdi', 'incc')),
  mao_obra      boolean not null default false,
  data_base_cct text check (data_base_cct is null or data_base_cct ~ '^\d{2}/\d{2}$'),  -- dd/mm da convenção coletiva
  alertas       boolean not null default true,
  obs           text check (char_length(obs) <= 1000),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists contratos_usuario on public.contratos (usuario_id, criado_em desc);
create index if not exists contratos_org on public.contratos (org_id) where compartilhado;
alter table public.contratos enable row level security;

create table if not exists public.contrato_eventos (
  id             uuid primary key default gen_random_uuid(),
  contrato_id    uuid not null references public.contratos on delete cascade,
  usuario_id     uuid not null default auth.uid() references auth.users on delete cascade,
  tipo           text not null check (tipo in ('reajuste', 'repactuacao', 'reequilibrio_trib', 'reequilibrio_fato', 'aditivo_valor', 'prorrogacao', 'outro')),
  data           date not null,
  percentual     numeric(9, 4),
  valor_anterior numeric(14, 2),
  valor_novo     numeric(14, 2),
  novo_fim       date,
  descricao      text check (char_length(descricao) <= 600),
  criado_em      timestamptz not null default now()
);
create index if not exists contrato_eventos_contrato on public.contrato_eventos (contrato_id, data);
alter table public.contrato_eventos enable row level security;

-- dono = quem está logado; equipe só a da própria pessoa; limites de uso
create or replace function public.contratos_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para salvar.'; end if;
  if tg_op = 'INSERT' then
    new.usuario_id := auth.uid();
    select count(*) into n from public.contratos where usuario_id = auth.uid();
    if n >= 500 then raise exception 'Limite de 500 contratos atingido.'; end if;
    new.criado_em := now();
  else
    new.usuario_id := old.usuario_id; new.criado_em := old.criado_em;
  end if;
  new.numero := btrim(new.numero);
  if new.org_id is not null and new.org_id is distinct from public.org_do_usuario(auth.uid()) then new.org_id := null; end if;
  if new.org_id is null then new.compartilhado := false; end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists contratos_antes on public.contratos;
create trigger contratos_antes before insert or update on public.contratos for each row execute function public.contratos_antes();

create or replace function public.contrato_eventos_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para salvar.'; end if;
  if not exists (select 1 from public.contratos c where c.id = new.contrato_id and c.usuario_id = auth.uid()) then
    raise exception 'Contrato não encontrado.';
  end if;
  new.usuario_id := auth.uid();
  select count(*) into n from public.contrato_eventos where contrato_id = new.contrato_id;
  if n >= 300 then raise exception 'Limite de 300 registros por contrato atingido.'; end if;
  new.criado_em := now();
  return new;
end $$;
drop trigger if exists contrato_eventos_antes on public.contrato_eventos;
create trigger contrato_eventos_antes before insert on public.contrato_eventos for each row execute function public.contrato_eventos_antes();
revoke execute on function public.contratos_antes(), public.contrato_eventos_antes() from public, anon, authenticated;

drop policy if exists contratos_ler on public.contratos;
create policy contratos_ler on public.contratos for select to authenticated
  using (usuario_id = auth.uid() or (compartilhado and org_id is not null and org_id = public.org_do_usuario(auth.uid())));
drop policy if exists contratos_inserir on public.contratos;
create policy contratos_inserir on public.contratos for insert to authenticated with check (usuario_id = auth.uid());
drop policy if exists contratos_alterar on public.contratos;
create policy contratos_alterar on public.contratos for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
drop policy if exists contratos_excluir on public.contratos;
create policy contratos_excluir on public.contratos for delete to authenticated using (usuario_id = auth.uid());

drop policy if exists contrato_eventos_ler on public.contrato_eventos;
create policy contrato_eventos_ler on public.contrato_eventos for select to authenticated
  using (exists (select 1 from public.contratos c where c.id = contrato_id
                 and (c.usuario_id = auth.uid() or (c.compartilhado and c.org_id is not null and c.org_id = public.org_do_usuario(auth.uid())))));
drop policy if exists contrato_eventos_inserir on public.contrato_eventos;
create policy contrato_eventos_inserir on public.contrato_eventos for insert to authenticated
  with check (exists (select 1 from public.contratos c where c.id = contrato_id and c.usuario_id = auth.uid()));
drop policy if exists contrato_eventos_excluir on public.contrato_eventos;
create policy contrato_eventos_excluir on public.contrato_eventos for delete to authenticated
  using (exists (select 1 from public.contratos c where c.id = contrato_id and c.usuario_id = auth.uid()));

revoke all on public.contratos, public.contrato_eventos from anon;
revoke all on public.contratos, public.contrato_eventos from authenticated;
grant select, insert, update, delete on public.contratos to authenticated;
grant select, insert, delete on public.contrato_eventos to authenticated;

-- Avisos por e-mail dos prazos dos contratos (função avisos, diária): cada aviso sai uma única vez.
create table if not exists public.contrato_alertas (
  id          bigint generated always as identity primary key,
  contrato_id uuid not null references public.contratos on delete cascade,
  tipo        text not null check (tipo in ('anualidade', 'convencao', 'fim90', 'fim30')),
  ref         text not null,
  enviado_em  timestamptz not null default now(),
  unique (contrato_id, tipo, ref)
);
alter table public.contrato_alertas enable row level security;
revoke all on public.contrato_alertas from anon, authenticated;
