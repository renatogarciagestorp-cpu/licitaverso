-- Aplicado a cada publicação (idempotente). Controle dos avisos de fim de plano.
alter table public.assinaturas add column if not exists aviso_fim_em timestamptz;
