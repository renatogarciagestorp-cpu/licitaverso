-- Calculadora → Mão de Obra Exclusiva: controle de uso do preenchimento pelo agente (exclusivo do Pro; limite diário).
-- Tabela interna: só as funções do servidor acessam.
create table if not exists public.mo_preenchimentos (
  id         bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users on delete cascade,
  modo       text not null default 'planejamento' check (modo in ('planejamento', 'repactuacao')),
  criado_em  timestamptz not null default now()
);
create index if not exists mo_preenchimentos_usuario on public.mo_preenchimentos (usuario_id, criado_em desc);
alter table public.mo_preenchimentos enable row level security;
revoke all on public.mo_preenchimentos from anon, authenticated;
