-- Troca de plano: se o Mercado Pago falhar ao cancelar a renovação automática do plano antigo, o pedido de
-- cancelamento fica registrado aqui e a conferência das renovações (a cada hora) tenta de novo. Depois de 3 dias
-- sem conseguir, a equipe recebe uma mensagem no Painel para cancelar à mão (nov/2026). Idempotente.
alter table public.renovacoes add column if not exists cancelar_desde timestamptz;
alter table public.renovacoes add column if not exists cancelar_avisado boolean not null default false;
create index if not exists renovacoes_cancelar on public.renovacoes (cancelar_desde) where cancelar_desde is not null;
