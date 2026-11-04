-- Fórum: vitrine pública para quem ainda não tem cadastro ou assinatura (prática dos fóruns e comunidades:
-- os títulos das perguntas são públicos; o contexto, os autores e as respostas ficam para os assinantes).
-- Não devolve nome, papel nem id de quem perguntou ou respondeu, nem o texto do contexto e das respostas.
create or replace function public.forum_vitrine()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'topicos', coalesce((
      select jsonb_agg(jsonb_build_object('nome', t.nome, 'descricao', t.descricao,
               'perguntas', (select count(*) from public.forum_perguntas p where p.topico_id = t.id),
               'ultima', (select max(p.criado_em) from public.forum_perguntas p where p.topico_id = t.id)) order by t.ordem, t.nome)
        from public.forum_topicos t where t.ativo), '[]'::jsonb),
    'perguntas', coalesce((
      select jsonb_agg(q.item order by q.criado_em desc) from (
        select p.criado_em, jsonb_build_object('topico', t.nome, 'titulo', p.titulo, 'criado_em', p.criado_em,
                 'respostas', (select count(*) from public.forum_respostas r where r.pergunta_id = p.id),
                 'oficial', exists (select 1 from public.forum_respostas r where r.pergunta_id = p.id and r.oficial)) as item
          from public.forum_perguntas p join public.forum_topicos t on t.id = p.topico_id
         where t.ativo order by p.criado_em desc limit 120) q), '[]'::jsonb));
$$;
revoke execute on function public.forum_vitrine() from public;
grant execute on function public.forum_vitrine() to anon, authenticated;
