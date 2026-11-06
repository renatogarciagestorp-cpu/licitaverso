-- Resumo mensal da carteira de contratos por e-mail: mês do último resumo enviado ("AAAA-MM"), para não repetir.
alter table public.perfis add column if not exists resumo_mensal_ref text;
