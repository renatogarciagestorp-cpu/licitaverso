-- Teste grátis de 7 dias: um por CPF, com e-mail confirmado (nov/2026).
-- Antes bastava criar a conta; quem criava várias contas ganhava vários testes (e várias análises grátis).
-- Agora o teste pede CPF válido no perfil e e-mail confirmado, e o mesmo CPF não libera outro teste em outra conta.
-- Idempotente: pode ser aplicado várias vezes.

-- CPF do teste guardado só como resumo (hash), como na análise grátis
alter table public.assinaturas add column if not exists teste_cpf text;
-- testes antigos: marca o primeiro de cada CPF já informado (os demais ficam sem marca, para não violar o índice)
with t as (
  select a.id, public.hash_cpf(p.documento) h,
         row_number() over (partition by public.hash_cpf(p.documento) order by a.inicio, a.id) n
    from public.assinaturas a join public.perfis p on p.id = a.usuario_id
   where a.origem = 'teste' and a.teste_cpf is null and public.cpf_valido(p.documento)
     and not exists (select 1 from public.assinaturas b where b.origem = 'teste' and b.teste_cpf = public.hash_cpf(p.documento)))
update public.assinaturas a set teste_cpf = t.h from t where t.id = a.id and t.n = 1;
create unique index if not exists assinaturas_teste_cpf_unico on public.assinaturas (teste_cpf)
  where origem = 'teste' and teste_cpf is not null;

create or replace function public.iniciar_teste()
returns public.assinaturas language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid();
  doc text;
  h text;
  nova public.assinaturas;
begin
  if u is null then raise exception 'Entre na sua conta para começar o teste.'; end if;
  if (select teste_usado from public.perfis where id = u) then
    raise exception 'O teste de 7 dias já foi usado nesta conta.';
  end if;
  if public.plano_vigente(u) is not null then
    raise exception 'Você já tem um plano ativo.';
  end if;
  if not exists (select 1 from auth.users where id = u and email_confirmed_at is not null) then
    raise exception 'Confirme seu e-mail para começar o teste: abra a mensagem que enviamos no cadastro (veja também a caixa de spam).';
  end if;
  select documento into doc from public.perfis where id = u;
  if not public.cpf_valido(doc) then
    raise exception 'Para começar o teste, informe um CPF válido em Minha conta → Perfil (um teste por CPF).';
  end if;
  h := public.hash_cpf(doc);
  -- dois pedidos ao mesmo tempo com o mesmo CPF: o segundo espera e cai na conferência abaixo
  perform pg_advisory_xact_lock(hashtext('teste:' || h));
  if exists (select 1 from public.assinaturas where origem = 'teste' and teste_cpf = h) then
    raise exception 'Este CPF já usou o teste de 7 dias em outra conta. Para continuar, escolha um plano.';
  end if;
  insert into public.assinaturas (usuario_id, plano, ciclo, status, valor, inicio, fim, origem, metodo, teste_cpf)
  values (u, 'teste', 'teste', 'ativa', 0, now(), now() + interval '7 days', 'teste', 'sem cobrança', h)
  returning * into nova;
  update public.perfis set teste_usado = true where id = u;
  return nova;
end $$;
revoke execute on function public.iniciar_teste() from public, anon;
grant execute on function public.iniciar_teste() to authenticated;
