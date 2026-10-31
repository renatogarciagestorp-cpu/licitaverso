-- Renovação automática de planos (assinatura recorrente do Mercado Pago, só cartão de crédito).
-- Cada cobrança aprovada cria um novo período em public.assinaturas (referência "renovacao:<id>").
create table if not exists public.renovacoes (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users on delete cascade,
  plano           text not null check (plano in ('basico', 'premium', 'pro')),
  ciclo           text not null check (ciclo in ('mensal', 'anual')),
  valor           numeric(10, 2) not null,
  status          text not null default 'pendente' check (status in ('pendente', 'ativa', 'pausada', 'cancelada')),
  mp_preapproval  text,
  proxima_cobranca timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  cancelado_em    timestamptz
);
create index if not exists renovacoes_usuario on public.renovacoes (usuario_id, status);
alter table public.renovacoes enable row level security;
drop policy if exists renovacoes_ler on public.renovacoes;
create policy renovacoes_ler on public.renovacoes for select to authenticated
  using (usuario_id = auth.uid() or public.is_admin());
-- inclusão e alterações só pelas funções do servidor (chave de serviço)
