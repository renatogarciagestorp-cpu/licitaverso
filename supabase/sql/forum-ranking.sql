-- Fórum: avaliação das respostas (0 a 5 estrelas) por quem fez a pergunta, e ranking dos participantes.
-- Pontos = soma das estrelas recebidas + 5 pontos por resposta escolhida como a melhor.
-- Não entram no ranking: respostas oficiais do especialista, respostas de administradores e respostas à própria pergunta.
-- Rankings: do mês (horário de Brasília, zera no dia 1º), do mês anterior (para o selo de destaque) e geral.
-- Níveis (pontos do ranking geral): Iniciante 0–9 · Colaborador 10–49 · Referência 50–149 · Mestre 150+.

alter table public.forum_respostas add column if not exists estrelas smallint check (estrelas between 0 and 5);
alter table public.forum_respostas add column if not exists avaliada_em timestamptz;
-- As estrelas só mudam pela função abaixo (o assinante só pode editar texto e citação da própria resposta).

create or replace function public.forum_avaliar(p_resposta bigint, p_estrelas int)
returns void language plpgsql security definer set search_path = public as $$
declare dono uuid; autor uuid; ofi boolean;
begin
  if p_estrelas is null or p_estrelas < 0 or p_estrelas > 5 then raise exception 'Escolha de 0 a 5 estrelas.'; end if;
  select p.autor_id, r.autor_id, r.oficial into dono, autor, ofi
    from public.forum_respostas r join public.forum_perguntas p on p.id = r.pergunta_id
    where r.id = p_resposta;
  if dono is null then raise exception 'Resposta não encontrada.'; end if;
  if dono <> auth.uid() then raise exception 'Só quem fez a pergunta pode avaliar as respostas.'; end if;
  if autor = auth.uid() then raise exception 'Você não pode avaliar a sua própria resposta.'; end if;
  update public.forum_respostas set estrelas = p_estrelas, avaliada_em = now() where id = p_resposta;
end $$;
revoke execute on function public.forum_avaliar(bigint, int) from public, anon;
grant execute on function public.forum_avaliar(bigint, int) to authenticated;

-- p_periodo: 'mes' | 'mes_anterior' | 'geral'
create or replace function public.forum_ranking(p_periodo text default 'mes', p_limite int default 20)
returns table (autor_id uuid, nome text, papel text, pontos int, media numeric, avaliadas int, respostas int, melhores int)
language sql stable security definer set search_path = public as $$
  with lim as (
    select (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as ini_mes,
           (date_trunc('month', (now() at time zone 'America/Sao_Paulo') - interval '1 month') at time zone 'America/Sao_Paulo') as ini_ant
  ), base as (
    select r.autor_id, r.autor_nome, r.autor_papel, r.estrelas, r.melhor, r.criado_em
      from public.forum_respostas r
      join public.forum_perguntas q on q.id = r.pergunta_id, lim
     where not r.oficial and r.autor_id <> q.autor_id
       and not exists (select 1 from public.perfis x where x.id = r.autor_id and x.admin)
       and case p_periodo
             when 'mes' then r.criado_em >= lim.ini_mes
             when 'mes_anterior' then r.criado_em >= lim.ini_ant and r.criado_em < lim.ini_mes
             else true end
  )
  select b.autor_id,
         (array_agg(b.autor_nome order by b.criado_em desc))[1],
         (array_agg(b.autor_papel order by b.criado_em desc))[1],
         (coalesce(sum(b.estrelas), 0) + 5 * count(*) filter (where b.melhor))::int as pontos,
         round(avg(b.estrelas) filter (where b.estrelas is not null), 1),
         (count(*) filter (where b.estrelas is not null))::int,
         count(*)::int,
         (count(*) filter (where b.melhor))::int
    from base b
   group by b.autor_id
  having coalesce(sum(b.estrelas), 0) + 5 * count(*) filter (where b.melhor) > 0
   order by pontos desc, 5 desc nulls last, 6 desc
   limit greatest(1, least(coalesce(p_limite, 20), 1000))
$$;
revoke execute on function public.forum_ranking(text, int) from public, anon;
grant execute on function public.forum_ranking(text, int) to authenticated;
