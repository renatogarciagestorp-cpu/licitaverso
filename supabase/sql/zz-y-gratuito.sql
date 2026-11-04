-- Plano Gratuito e fim do preço de fundador (nov/2026). Ajustes idempotentes.

-- 1) Leitura do fórum: grátis para qualquer pessoa com conta (plano Gratuito). Perguntar e responder continua
--    restrito aos planos pagos e ao teste de 7 dias (pode_participar, abaixo). Visitantes sem conta seguem vendo
--    só a vitrine pública (títulos e contagens, forum_vitrine).
create or replace function public.pode_ler_forum()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
$$;

-- 2) Preço de fundador encerrado: não há mais vagas e ninguém recebe o desconto, nem nas novas contratações nem
--    nas renovações. O histórico (perfis.fundador_em, assinaturas.fundador) fica guardado.
create or replace function public.limite_fundadores() returns int language sql immutable as $$ select 0 $$;
create or replace function public.eh_fundador(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$ select false $$;

-- 3) Perguntar e responder no fórum: planos Básico, Premium e Pro e também o teste de 7 dias.
create or replace function public.pode_participar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(public.plano_vigente(auth.uid()) in ('teste', 'basico', 'premium', 'pro'), false)
$$;

-- 4) Fim do preço de fundador nas renovações automáticas já ativas no Mercado Pago: a pessoa recebe um aviso por
--    e-mail com 30 dias de antecedência; passado o prazo, o valor da assinatura recorrente é atualizado para o preço
--    de tabela (função avisos, diária).
alter table public.renovacoes add column if not exists aviso_preco_em timestamptz;
alter table public.renovacoes add column if not exists novo_valor numeric(10, 2);
alter table public.renovacoes add column if not exists preco_atualizado_em timestamptz;
