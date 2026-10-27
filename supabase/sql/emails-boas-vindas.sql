-- E-mails de boas-vindas e do teste grátis (cada um enviado uma única vez).
alter table public.perfis add column if not exists boas_vindas_em timestamptz;
alter table public.assinaturas add column if not exists dica_teste_em timestamptz;
-- Quem já tinha conta antes desta mudança não recebe boas-vindas atrasadas.
update public.perfis set boas_vindas_em = criado_em where boas_vindas_em is null and criado_em < '2026-10-27 15:30:00+00';
