-- Plano Gratuito e fim do preço de fundador (nov/2026). Ajustes idempotentes.

-- 1) Leitura do fórum: grátis para qualquer pessoa com conta (plano Gratuito). Perguntar e responder continua
--    restrito aos planos Básico, Premium e Pro (pode_participar_forum não muda). Visitantes sem conta seguem vendo
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
